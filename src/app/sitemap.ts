import type { MetadataRoute } from "next";
import { GRID_SIZE } from "@/utils/constants";
import { getSiteOrigin } from "@/utils/siteUrl";

export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteOrigin();
  const lastModified = new Date();

  const homeEntry: MetadataRoute.Sitemap[number] = {
    url: `${siteUrl}/`,
    lastModified,
    changeFrequency: "hourly",
    priority: 1,
  };

  const blockEntries: MetadataRoute.Sitemap = Array.from({ length: GRID_SIZE }, (_, id) => ({
    url: `${siteUrl}/block/${id}`,
    lastModified,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [homeEntry, ...blockEntries];
}
