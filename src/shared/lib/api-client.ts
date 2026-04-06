// Centralizes agent and LM Studio requests so URL building stays consistent across Web, Android, and iOS.
import {
  AGENT_HTTP_URL,
  LM_STUDIO_DEFAULT_URL,
} from "@/shared/lib/constants";
import {
  DANGEROUS_ACTION_HEADER,
  DELETE_WORKSPACE_CONFIRMATION,
} from "@/shared/lib/api-contracts";
import { useSettingsStore } from "@/stores/settings-store";

export interface ProjectListItem {
  name: string;
  displayName: string;
  createdAt: number;
}

export interface ProjectFilePayload {
  path: string;
  content: string;
}

export interface LmModel {
  id: string;
  object: string;
}

type QueryValue = string | number | boolean | undefined;

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, QueryValue>;
  timeoutMs?: number;
}

interface DataEnvelope<T> {
  data: T;
}

const appendQuery = (
  url: URL,
  query?: Record<string, QueryValue>
): void => {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
};

export const normalizeBaseUrl = (
  value: string,
  fallback = AGENT_HTTP_URL
): string => {
  const trimmed = value.trim();
  return (trimmed || fallback).replace(/\/+$/, "");
};

export const toWebSocketUrl = (value: string): string =>
  normalizeBaseUrl(value)
    .replace(/^http:\/\//, "ws://")
    .replace(/^https:\/\//, "wss://");

class ApiClient {
  private readonly defaultTimeoutMs = 10_000;

  private buildUrl(
    baseUrl: string,
    pathname: string,
    query?: Record<string, QueryValue>
  ): string {
    const url = new URL(pathname, `${baseUrl}/`);
    appendQuery(url, query);
    return url.toString();
  }

  private async buildError(response: Response): Promise<Error> {
    const raw = (await response.text()).trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed.error) {
        return new Error(parsed.error);
      }
    } catch { /* not JSON, use raw text */ }
    return new Error(raw || `${response.status} ${response.statusText}`);
  }

  private async fetchJson<T>(
    url: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { body, headers, timeoutMs = this.defaultTimeoutMs, ...init } = options;
    const finalHeaders = new Headers(headers);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

    if (body !== undefined && !finalHeaders.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json");
    }

    try {
      const response = await fetch(url, {
        ...init,
        headers: finalHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await this.buildError(response);
      }

      try {
        return await response.json() as T;
      } catch {
        throw new Error(`Invalid JSON response from ${url}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getData<T>(
    pathname: string,
    query?: Record<string, QueryValue>
  ): Promise<T> {
    const url = this.buildUrl(this.getAgentUrl(), pathname, query);
    const response = await this.fetchJson<DataEnvelope<T>>(url);
    return response.data;
  }

  async postData<T>(pathname: string, body: unknown, timeoutMs?: number): Promise<T> {
    const url = this.buildUrl(this.getAgentUrl(), pathname);
    const response = await this.fetchJson<DataEnvelope<T>>(url, {
      method: "POST",
      body,
      timeoutMs,
    });
    return response.data;
  }

  async deleteData<T>(
    pathname: string,
    headers?: HeadersInit
  ): Promise<T> {
    const url = this.buildUrl(this.getAgentUrl(), pathname);
    const response = await this.fetchJson<DataEnvelope<T>>(url, {
      method: "DELETE",
      headers,
    });
    return response.data;
  }

  getAgentUrl(): string {
    return normalizeBaseUrl(useSettingsStore.getState().agentUrl, AGENT_HTTP_URL);
  }

  getLmStudioUrl(): string {
    return normalizeBaseUrl(
      useSettingsStore.getState().lmStudioUrl,
      LM_STUDIO_DEFAULT_URL
    );
  }

  getWebSocketUrl(): string {
    return toWebSocketUrl(this.getAgentUrl());
  }

  getPreviewProxyUrl(projectName?: string): string {
    const path = projectName
      ? `/preview/${encodeURIComponent(projectName)}/`
      : "/preview/";
    return this.buildUrl(this.getAgentUrl(), path);
  }

  getProjectExportUrl(projectName: string): string {
    return this.buildUrl(
      this.getAgentUrl(),
      `/api/projects/${encodeURIComponent(projectName)}/export`
    );
  }

  listProjects(): Promise<ProjectListItem[]> {
    return this.getData<ProjectListItem[]>("/api/projects");
  }

  deleteAllProjects(): Promise<boolean> {
    return this.deleteData<boolean>("/api/projects/all", {
      [DANGEROUS_ACTION_HEADER]: DELETE_WORKSPACE_CONFIRMATION,
    });
  }

  enhancePrompt(payload: {
    prompt: string;
    model?: string;
    lmStudioUrl?: string;
  }): Promise<string> {
    return this.postData<string>("/api/llm/enhance", payload, 60_000);
  }

  getProjectTree<T>(projectName: string): Promise<T> {
    return this.getData<T>(
      `/api/projects/${encodeURIComponent(projectName)}/files`
    );
  }

  listProjectFiles(projectName: string): Promise<string[]> {
    return this.getData<string[]>(
      `/api/projects/${encodeURIComponent(projectName)}/all-files`
    );
  }

  getProjectFile(projectName: string, filePath: string): Promise<ProjectFilePayload> {
    return this.getData<ProjectFilePayload>(
      `/api/projects/${encodeURIComponent(projectName)}/file`,
      { path: filePath }
    );
  }

  async listLmStudioModels(): Promise<LmModel[]> {
    try {
      const result = await this.getData<{ models: LmModel[]; status: string }>(
        "/api/llm/models",
        { url: this.getLmStudioUrl() }
      );
      return result.models ?? [];
    } catch {
      return [];
    }
  }

  async listModelsFromUrl(url: string): Promise<LmModel[]> {
    try {
      const result = await this.getData<{ models: LmModel[]; status: string }>(
        "/api/llm/models",
        { url }
      );
      return result.models ?? [];
    } catch {
      return [];
    }
  }

  async testLlmConnection(url: string): Promise<{ ok: boolean; models: number; error?: string }> {
    try {
      const result = await this.getData<{ models: LmModel[]; status: string; error?: string }>(
        "/api/llm/models",
        { url }
      );
      return {
        ok: result.status === "connected",
        models: result.models?.length ?? 0,
        error: result.error,
      };
    } catch (e) {
      return { ok: false, models: 0, error: e instanceof Error ? e.message : "Connection failed" };
    }
  }

  async testAgentConnection(timeoutMs = 5000): Promise<void> {
    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket is not available in this environment");
    }

    const wsUrl = this.getWebSocketUrl();

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        cleanup();
        socket.close();
        reject(new Error(`Connection timed out: ${wsUrl}`));
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timeout);
        socket.onopen = null;
        socket.onerror = null;
        socket.onclose = null;
      };

      socket.onopen = () => {
        cleanup();
        socket.close();
        resolve();
      };

      socket.onerror = () => {
        cleanup();
        reject(new Error(`Failed to connect to ${wsUrl}`));
      };

      socket.onclose = (event) => {
        cleanup();
        reject(new Error(`Connection closed before opening (${event.code})`));
      };
    });
  }
}

export const apiClient = new ApiClient();
