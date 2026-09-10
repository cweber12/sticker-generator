import JSZip from 'jszip';
import type { LabelTemplate } from '@/config/template';
import type { SizeId, TypeId } from '@/config/variants';
import { getSize, getType, variantKey } from '@/config/variants';
import { loadMasterImage } from '@/fs/library';
import { requestKey, type RequestKey } from '@/lib/basket';
import { loadDiamondLogo, renderSticker } from '@/render/renderSticker';
import { canvasToStickerPdf } from '@/render/toPdf';
import type { Sticker, StickerRequest } from '@/types';
import { resolveLabelText, resolveTemplate, upcFor } from '@/types';

/**
 * StickerRequest[] -> ZIP. This is the whole application.
 *
 * Flat inside: these go to a client who prints them, not to a filing system.
 * Every render goes through the same `renderSticker` the grid uses, at scale 1
 * for the full 300 dpi, so what was previewed is what ships.
 *
 * Nothing here throws. A sticker whose master has gone missing costs you that
 * one PDF and a line in the report, never the other thirty-nine.
 */

export interface ArchiveContext {
  dir: FileSystemDirectoryHandle;
  template: LabelTemplate;
  stickersById: ReadonlyMap<string, Sticker>;
  upcs: Readonly<Record<string, string>>;
}

export interface ArchiveFailure {
  label: string;
  message: string;
}

export interface Archive {
  blob: Blob | null;
  filename: string;
  /** How many PDFs are actually in the archive. */
  count: number;
  /**
   * The basket entries that really made it in.
   *
   * Identity, not a label: the caller empties exactly these from the basket
   * and leaves the failures behind, so a master that was mid-sync costs one
   * more press of Download rather than a re-assembled order.
   */
  succeeded: RequestKey[];
  failures: ArchiveFailure[];
}

export async function buildStickerArchive(
  requests: readonly StickerRequest[],
  context: ArchiveContext,
): Promise<Archive> {
  const zip = new JSZip();
  const taken = new Set<string>();
  const failures: ArchiveFailure[] = [];
  const succeeded: RequestKey[] = [];
  let count = 0;

  for (const request of requests) {
    const sticker = context.stickersById.get(request.stickerId);
    if (!sticker) {
      failures.push({
        label: request.stickerId,
        message: 'That sticker is no longer in the library.',
      });
      continue;
    }

    const { artName, subtitle } = resolveLabelText(sticker, request.size, request.type);
    const label = `${artName || sticker.masterFile} (${request.size} ${request.type})`;

    try {
      const master = await loadMasterImage(context.dir, sticker.masterFile);
      const logo = request.logo ? await loadDiamondLogo() : null;
      const upc = upcFor(context.upcs, sticker, request.size, request.type);

      const canvas = await renderSticker({
        image: master.source,
        imageW: master.width,
        imageH: master.height,
        artName,
        subtitle,
        upc,
        marks: { barcode: request.barcode, logo: request.logo },
        template: resolveTemplate(
          context.template,
          sticker,
          variantKey(request.size, request.type),
        ),
        logo,
      });

      const pdf = canvasToStickerPdf(canvas, { artName, subtitle, upc });
      const filename = uniqueFilename(
        stickerFilename(artName || sticker.slug, request.size, request.type),
        taken,
      );
      taken.add(filename);
      zip.file(filename, pdf);
      count += 1;
      succeeded.push(requestKey(request.stickerId, request.size, request.type));
    } catch (error) {
      failures.push({
        label,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    blob: count > 0 ? await zip.generateAsync({ type: 'blob' }) : null,
    filename: archiveFilename(),
    count,
    succeeded,
    failures,
  };
}

/** `SunsetBeach_DAK_16x20.pdf`, from the type code and size id in variants.ts. */
export function stickerFilename(artName: string, size: SizeId, type: TypeId): string {
  const code = getType(type)?.code ?? type;
  const sizeId = getSize(size)?.id ?? size;
  return `${safeStem(artName)}_${code}_${sizeId}.pdf`;
}

/**
 * An art name reduced to something every filesystem accepts.
 *
 * Spaces close up rather than becoming underscores, because underscore is the
 * field separator: "Sunset Beach" must not produce a name that reads as though
 * it had four fields.
 */
export function safeStem(artName: string): string {
  const stem = artName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .join('');
  return stem || 'Sticker';
}

/**
 * `name.pdf`, then `name-2.pdf`. Does not record the result: the caller owns
 * `taken`, and adds to it only once the entry is really in the archive.
 */
export function uniqueFilename(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired)) return desired;

  const dot = desired.lastIndexOf('.');
  const stem = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : '';

  let n = 2;
  while (taken.has(`${stem}-${n}${ext}`)) n += 1;
  return `${stem}-${n}${ext}`;
}

/** `stickers_2026-09-09.zip`, in local time — the day you made them. */
export function archiveFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `stickers_${year}-${month}-${day}.zip`;
}

/** Hands the archive to the browser's downloads. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking in the same tick can cancel the download in some builds of
  // Chrome; one turn of the loop is enough for it to have started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
