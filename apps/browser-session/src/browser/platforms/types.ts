import type { PlatformId } from "@job-boardwalk/platform-catalog";
import type { PlatformAccessAssessment } from "@job-boardwalk/contracts";

export interface NavigationResponseFacts {
  readonly ok: boolean;
  readonly redirectSourceUrls: readonly string[];
  readonly url: string;
}
export interface PageAccessFacts {
  readonly elements: readonly {
    readonly disabled?: boolean;
    readonly href?: string;
    readonly name?: string;
    readonly role?: string;
  }[];
  readonly text: string;
  readonly url: string;
}
export interface RecruitingPlatformAdapter extends PlatformPageDefinition {
  readonly entryUrl: string;
  readonly label: string;
  readonly loginUrl: string;
  readonly platformId: PlatformId;
  readonly isInNavigationScope: (value: string) => boolean;
  readonly isJobDetailPage: (value: string) => boolean;
  readonly isLoginPage: (value: string) => boolean;
}
export interface JobLinkConfig {
  readonly jobLinkPathPattern: string;
  readonly jobLinkOrigins?: readonly string[];
}

export interface JobCardExtractionConfig extends JobLinkConfig {
  readonly cardSelector?: string;
  readonly companySelectors: readonly string[];
  readonly containerSelectors: readonly string[];
  readonly detailsSelectors: readonly string[];
  readonly educationTextPattern?: string;
  readonly excludedTitlePattern?: string;
  readonly locationSelectors: readonly string[];
  readonly requireContainerMatch?: boolean;
  readonly salarySelectors: readonly string[];
  readonly salaryTextPattern?: string;
  readonly textReplacements?: Readonly<Record<string, string>>;
  readonly experienceTextPattern?: string;
  readonly titleBoundaryPattern?: string;
  readonly titleFromFirstLine?: boolean;
  readonly titleSelectors: readonly string[];
}

export interface PlatformPageDefinition {
  readonly jobLink: JobLinkConfig;
  readonly jobCardExtractionConfig: JobCardExtractionConfig;
  readonly jobDescriptionExtractionConfig: JobDescriptionExtractionConfig;
  readonly isJobCardCollectionPage: (value: string) => boolean;
  readonly assessNavigation?: (
    response: NavigationResponseFacts,
  ) => PlatformAccessAssessment | null;
  readonly assessPage?: (page: PageAccessFacts) => PlatformAccessAssessment | null;
  readonly snapshotSettleMilliseconds?: number;
}

export interface JobDescriptionExtractionConfig {
  readonly factTextSelectors?: readonly string[];
  readonly salarySelectors?: readonly string[];
  readonly locationSelectors?: readonly string[];
  readonly titleSelectors?: readonly string[];
  readonly detailsSelectors?: readonly string[];
  readonly companySelectors: readonly string[];
  readonly descriptionSelectors: readonly string[];
  readonly descriptionTextRanges?: readonly {
    readonly endMarker: string;
    readonly includeStartMarker?: boolean;
    readonly startMarker: string;
  }[];
  readonly titleLineBeforeMarker?: string;
}
