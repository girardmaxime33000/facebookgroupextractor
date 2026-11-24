import type { Post } from "./model/index.js";

/** Moteur OCR externe (Tesseract, service tiers…). Aucun moteur n'est fourni par défaut. */
export interface OcrProvider {
  recognize(imageUrl: string): Promise<string>;
}

/** Ajoute `ocrText` aux photos des posts. Une erreur OCR sur une image n'interrompt pas le traitement. */
export async function enrichWithOcr(posts: Post[], ocr: OcrProvider): Promise<Post[]> {
  for (const post of posts) {
    for (const a of post.attachments ?? []) {
      if (a.type !== "photo" || a.ocrText !== undefined) continue;
      try {
        const text = (await ocr.recognize(a.url)).trim();
        if (text) a.ocrText = text;
      } catch {
        /* image ignorée */
      }
    }
  }
  return posts;
}
