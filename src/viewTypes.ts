import type { GalleryItem } from "./api";
export interface ViewItem {
  path: string;
  name: string;
  url?: string;
  gallery?: GalleryItem;
}
