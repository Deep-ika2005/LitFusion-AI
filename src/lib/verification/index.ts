import type { Paper, PublisherResult, PublicationStatusResult, ScopusResult, SourcePlatform } from "@/types";
import { verifyPublicationStatus } from "./publication";
import { verifyPublisher } from "./publisher";
import { getScopusCapability, verifyScopusIndexing, type ScopusVerifyOptions } from "./scopus";
import { verifyQuartile, type QuartileVerifyOptions } from "./quartile";

export { verifyPublicationStatus, isPublishedRecord, PUBLICATION_STATUS_LABELS } from "./publication";
export { verifyPublisher, verifyPublisherFromOpenAlex, PUBLISHERS, getPublisherDefinition, getPublisherLabel, getPublisherOptions, OTHER_PUBLISHER_ID, OTHER_PUBLISHER_LABEL, isPredefinedPublisherId, isOtherPublisherPaper, findPredefinedByName, normalizePublisherQuery } from "./publisher";
export { verifyScopusIndexing, getScopusCapability, clearScopusCaches, normalizeDoi } from "./scopus";
export { verifyQuartile, getQuartileCapability, clearQuartileCaches, quartileScoreForTier, QUARTILE_SCORES, normalizeQuartileTier } from "./quartile";

/** Landing-page hosts mapped to the platform a record was retrieved from. */
const PLATFORM_BY_HOST: Record<string, string> = {
  "ieeexplore.ieee.org": "IEEE Xplore",
  "ieeexplore.ieee.org.proxy": "IEEE Xplore",
  "link.springer.com": "SpringerLink",
  "rd.springer.com": "SpringerLink",
  "www.nature.com": "Nature Portfolio",
  "nature.com": "Nature Portfolio",
  "sciencedirect.com": "ScienceDirect",
  "www.sciencedirect.com": "ScienceDirect",
  "dl.acm.org": "ACM Digital Library",
  "onlinelibrary.wiley.com": "Wiley Online Library",
  "www.mdpi.com": "MDPI",
  "www.tandfonline.com": "Taylor & Francis Online",
  "tandfonline.com": "Taylor & Francis Online",
  "arxiv.org": "arXiv",
  "www.biorxiv.org": "bioRxiv",
  "www.medrxiv.org": "medRxiv",
  "papers.ssrn.com": "SSRN",
  "ssrn.com": "SSRN",
  "www.researchsquare.com": "Research Square",
  "openreview.net": "OpenReview",
  "proceedings.neurips.cc": "NeurIPS",
  "proceedings.mlr.press": "PMLR",
  "pubmed.ncbi.nlm.nih.gov": "PubMed",
  "europepmc.org": "Europe PMC",
  "www.semanticscholar.org": "Semantic Scholar",
  "arxiv.org/pdf": "arXiv",
  "zenodo.org": "Zenodo",
  "osf.io": "OSF",
  "figshare.com": "figshare",
  "ieeexplore.ieee.org/stamp": "IEEE Xplore",
};

export function resolveSourcePlatform(url: string | null | undefined): SourcePlatform | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const name = PLATFORM_BY_HOST[host];
    if (!name) return null;
    return { name, host, url };
  } catch {
    return null;
  }
}

export interface VerifyPapersOptions {
  /** Resolve Scopus coverage (requires an API key or a populated local source list). */
  resolveScopus?: boolean;
  scopus?: ScopusVerifyOptions;
  /** Resolve journal quartile (registry and/or live API). Defaults to true; fail-open. */
  resolveQuartile?: boolean;
  quartile?: QuartileVerifyOptions;
}

/**
 * Verification stage of the search pipeline:
 * Metadata Normalization -> Publication Verification -> Publisher Verification
 *                        -> Scopus Verification.
 *
 * Every field is either backed by evidence or explicitly reported as unknown.
 */
export async function verifyPapers(papers: Paper[], options: VerifyPapersOptions = {}): Promise<Paper[]> {
  const shouldResolveScopus = options.resolveScopus ?? getScopusCapability().isAvailable;
  const shouldResolveQuartile = options.resolveQuartile ?? true;

  return Promise.all(
    papers.map(async (paper): Promise<Paper> => {
      const publicationStatus: PublicationStatusResult = verifyPublicationStatus(paper);
      const publisher: PublisherResult = await verifyPublisher(paper);
      const scopus: ScopusResult = shouldResolveScopus
        ? await verifyScopusIndexing(paper, options.scopus)
        : {
            status: "unknown",
            label: "Unknown",
            method: "none",
            checkedAt: new Date().toISOString(),
            confidence: "unknown",
            evidence: [],
            reason:
              "Scopus coverage is not verified in this deployment. Configure SCOPUS_API_KEY or run the Scopus source-registry builder to enable verification.",
          };

      return {
        ...paper,
        publicationStatus,
        publisher,
        scopus,
        quartile: shouldResolveQuartile
          ? await verifyQuartile(paper, options.quartile).catch(() => ({
              quartile: null,
              label: "Quartile unavailable",
              category: null,
              year: null,
              provenance: null,
              method: "none" as const,
              checkedAt: new Date().toISOString(),
              confidence: "unknown" as const,
              evidence: [],
              reason: "Quartile lookup failed; reported as unavailable rather than guessed.",
            }))
          : (paper.quartile ?? null),
        sourcePlatform: resolveSourcePlatform(paper.landingPageUrl) ?? resolveSourcePlatform(paper.pdfUrl),
      };
    })
  );
}

export async function verifyPaper(paper: Paper, options: VerifyPapersOptions = {}): Promise<Paper> {
  const [verified] = await verifyPapers([paper], options);
  return verified;
}
