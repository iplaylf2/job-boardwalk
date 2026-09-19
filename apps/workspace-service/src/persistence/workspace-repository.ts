import { openWorkspaceDatabase } from "./database.js";
import type { DatabaseSync } from "node:sqlite";
import type {
  JobCardObservation,
  JobDescriptionObservation,
  JobPosting,
  JobPostingPage,
  JobSearchIntent,
  RecommendationPageReference,
  PlatformAccessObservation,
  ProfileFact,
  ResearchReport,
  SaveResearchReportCommand,
  WorkspaceChangeAttribution,
  ResearchReportSummary,
  RecordedPlatformAccessObservation,
  SaveJobObservationResult,
  JobEngagementSnapshot,
  SynchronizeJobEngagementResult,
} from "@job-boardwalk/contracts";
import type { JobLibraryQuery } from "#/job-library/query.js";
import { ResearchReportRepository } from "./research-report-repository.js";
import { PlatformAccessRepository } from "./platform-access-repository.js";
import { ProfileFactRepository } from "./profile-fact-repository.js";
import { JobSearchIntentRepository } from "./job-search-intent-repository.js";
import { JobLibraryRepository } from "./job-library-repository.js";
import { JobObservationRepository } from "./job-observation-repository.js";
import { JobEngagementRepository } from "./job-engagement-repository.js";

export class WorkspaceRepository {
  readonly #client: DatabaseSync;
  readonly #profileFacts: ProfileFactRepository;
  readonly #jobSearchIntents: JobSearchIntentRepository;
  readonly #platformAccess: PlatformAccessRepository;
  readonly #jobLibrary: JobLibraryRepository;
  readonly #jobObservations: JobObservationRepository;
  readonly #jobEngagements: JobEngagementRepository;
  readonly #researchReports: ResearchReportRepository;
  public constructor({
    databasePath,
    migrationsDirectory,
  }: {
    databasePath: string;
    migrationsDirectory: string;
  }) {
    const { client, database } = openWorkspaceDatabase(databasePath, migrationsDirectory);
    this.#client = client;
    this.#profileFacts = new ProfileFactRepository(database);
    this.#jobSearchIntents = new JobSearchIntentRepository(database);
    this.#platformAccess = new PlatformAccessRepository(database);
    this.#jobLibrary = new JobLibraryRepository(database);
    this.#jobObservations = new JobObservationRepository(database);
    this.#jobEngagements = new JobEngagementRepository(database);
    this.#researchReports = new ResearchReportRepository(database);
  }

  public close(): void {
    this.#client.close();
  }
  public listProfileFacts(): ProfileFact[] {
    return this.#profileFacts.listProfileFacts();
  }
  public createProfileFact(input: {
    confirmed: boolean;
    initiatedBy: "agent" | "system" | "user";
    key: string;
    reason: string;
    source: string;
    value: string;
  }): ProfileFact {
    return this.#profileFacts.createProfileFact(input);
  }
  public updateProfileFact(input: {
    confirmed: boolean;
    id: number;
    initiatedBy: "agent" | "system" | "user";
    key: string;
    reason: string;
    source: string;
    value: string;
  }): ProfileFact | null {
    return this.#profileFacts.updateProfileFact(input);
  }
  public deleteProfileFact(input: {
    id: number;
    initiatedBy: "agent" | "system" | "user";
    reason: string;
  }): void {
    return this.#profileFacts.deleteProfileFact(input);
  }
  public listJobSearchIntents(): JobSearchIntent[] {
    return this.#jobSearchIntents.listJobSearchIntents();
  }
  public saveJobSearchIntent(input: {
    city: string;
    id?: number;
    initiatedBy: "agent" | "system" | "user";
    name: string;
    position: string;
    recommendationPages: RecommendationPageReference[];
    reason: string;
    selected: boolean;
  }): JobSearchIntent {
    return this.#jobSearchIntents.saveJobSearchIntent(input);
  }
  public selectJobSearchIntent(input: {
    id: number;
    initiatedBy: "agent" | "system" | "user";
    reason: string;
  }): void {
    return this.#jobSearchIntents.selectJobSearchIntent(input);
  }
  public deleteJobSearchIntent(input: {
    id: number;
    initiatedBy: "agent" | "system" | "user";
    reason: string;
  }): void {
    return this.#jobSearchIntents.deleteJobSearchIntent(input);
  }
  public recordPlatformAccessObservation(
    observation: PlatformAccessObservation,
  ): RecordedPlatformAccessObservation {
    return this.#platformAccess.recordPlatformAccessObservation(observation);
  }
  public reconcilePlatformAccessObservation(
    observation: PlatformAccessObservation,
  ): RecordedPlatformAccessObservation | null {
    return this.#platformAccess.reconcilePlatformAccessObservation(observation);
  }
  public listPlatformAccessObservations(): RecordedPlatformAccessObservation[] {
    return this.#platformAccess.listPlatformAccessObservations();
  }
  public listJobPostings(): JobPosting[] {
    return this.#jobLibrary.listJobPostings();
  }
  public listJobPostingPage(input: JobLibraryQuery): JobPostingPage {
    return this.#jobLibrary.listJobPostingPage(input);
  }
  public saveJobCardObservation(input: {
    initiatedBy: "agent" | "system" | "user";
    observation: JobCardObservation;
    reason: string;
  }): SaveJobObservationResult {
    return this.#jobObservations.saveJobCardObservation(input);
  }
  public saveJobDescriptionObservation(input: {
    initiatedBy: "agent" | "system" | "user";
    observation: JobDescriptionObservation;
    reason: string;
    sourceId?: number;
  }): SaveJobObservationResult {
    return this.#jobObservations.saveJobDescriptionObservation(input);
  }
  public synchronizeJobEngagement(input: {
    initiatedBy: "agent" | "system" | "user";
    reason: string;
    snapshot: JobEngagementSnapshot;
  }): SynchronizeJobEngagementResult {
    return this.#jobEngagements.synchronizeJobEngagement(input);
  }
  public listResearchReports(): ResearchReportSummary[] {
    return this.#researchReports.listResearchReports();
  }
  public readResearchReport(id: number): ResearchReport | null {
    return this.#researchReports.readResearchReport(id);
  }
  public saveResearchReport(
    input: SaveResearchReportCommand & { id?: number },
  ): ResearchReport | null {
    return this.#researchReports.saveResearchReport(input);
  }
  public deleteResearchReport(input: WorkspaceChangeAttribution & { id: number }): boolean {
    return this.#researchReports.deleteResearchReport(input);
  }
}
