export type BrandIdentity = {
  name: string;
  shortName: string;
  tagline: string;
  assetStatus: "WORKING_BRAND_PENDING_LEGAL_CLEARANCE";
  wordmark: string;
  symbol: string;
  favicon: string;
  accentToken: "accent";
  futureMarketingAssets: "DEFERRED";
};

/** Working brand asset — not a final legal-cleared identity. */
export const workingBrand: BrandIdentity = {
  name: "FlickSend",
  shortName: "FlickSend",
  tagline: "Send files like messages.",
  assetStatus: "WORKING_BRAND_PENDING_LEGAL_CLEARANCE",
  wordmark: "FlickSend",
  symbol: "flicksend-working-symbol",
  favicon: "/icon.svg",
  accentToken: "accent",
  futureMarketingAssets: "DEFERRED"
};

export const productMetadata = workingBrand;
