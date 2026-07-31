import type { VelvetVersionLock } from "@velvet/contracts";

export interface GitHubManagedFile {
  path: string;
  content: string;
}

export interface GitHubUpdateRepository {
  id: number;
  owner: string;
  name: string;
  defaultBranch: string;
}

export interface GitHubUpdatePullRequest {
  number: number;
  state: "open" | "closed";
  htmlUrl: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
}

export interface GitHubUpdateCheckRun {
  id: number;
  name: string;
  status:
    | "requested"
    | "waiting"
    | "pending"
    | "queued"
    | "in_progress"
    | "completed";
  conclusion: string | null;
  htmlUrl: string;
  headSha: string;
}

export interface GitHubUpdateMerge {
  merged: boolean;
  sha: string | null;
}

export interface GitHubRepositoryUpdateClient {
  readonly repository: GitHubUpdateRepository;
  defaultBranchHead(): Promise<string>;
  readConfiguration(): Promise<{ source: string; blobSha: string }>;
  readVersionLock(): Promise<{ lock: VelvetVersionLock; blobSha: string }>;
  readManagedFiles(ref: string): Promise<GitHubManagedFile[]>;
  createUpdateBranch(version: string, baseSha: string): Promise<void>;
  commitUpdate(
    version: string,
    expectedHeadSha: string,
    files: readonly GitHubManagedFile[],
  ): Promise<string>;
  createPullRequest(
    version: string,
    expectedHeadSha: string,
    expectedBaseSha: string,
  ): Promise<GitHubUpdatePullRequest>;
  pullRequests(version: string): Promise<GitHubUpdatePullRequest[]>;
  checkRuns(headSha: string): Promise<GitHubUpdateCheckRun[]>;
  mergePullRequest(
    pullRequestNumber: number,
    version: string,
    expectedHeadSha: string,
  ): Promise<GitHubUpdateMerge>;
  deleteUpdateBranch(version: string, expectedHeadSha: string): Promise<void>;
  commitRevert(
    version: string,
    expectedHeadSha: string,
    files: readonly GitHubManagedFile[],
  ): Promise<string>;
}

export interface GitHubUpdateClient {
  forRepository(
    installationId: number,
    repositoryId: number,
  ): Promise<GitHubRepositoryUpdateClient>;
}
