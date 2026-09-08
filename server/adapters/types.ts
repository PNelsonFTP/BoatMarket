import { z } from "zod";
import type { Listing } from "../../lib/types";
export const sourceConfigSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(80),
  name: z.string().min(1).max(100),
  adapter: z.enum([
    "boattrader",
    "yachtworld",
    "craigslist",
    "facebook",
    "boats",
    "iboats",
    "ebay",
    "dealer",
    "cpo",
  ]),
  enabled: z.boolean().default(false),
  urls: z
    .array(
      z
        .string()
        .url()
        .refine((v) => /^https?:\/\//.test(v)),
    )
    .max(30)
    .default([]),
  area: z.string().max(200).default("Configured inventory"),
  render: z.boolean().default(false),
  autoPaginate: z.boolean().default(false),
  maxInventoryPages: z.number().int().min(1).max(100).default(40),
  followDetails: z.boolean().default(false),
  detailMaxLength: z.number().positive().optional(),
  detailMakes: z.array(z.string().min(1).max(80)).max(50).optional(),
  maxDetailPages: z.number().int().min(1).max(150).default(80),
  selectors: z
    .object({
      item: z.string().max(200),
      title: z.string().max(200),
      link: z.string().max(200),
      price: z.string().max(200),
      image: z.string().max(200).optional(),
      location: z.string().max(200).optional(),
    })
    .optional(),
});
export type SourceConfig = z.infer<typeof sourceConfigSchema>;
export interface Adapter {
  id: SourceConfig["adapter"];
  parse(html: string, url: string, config: SourceConfig): Listing[];
}
