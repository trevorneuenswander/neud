import type http from "http";
import type { DeveloperToolsService } from "./developer-tools-service";
import { LOCAL_API_ERROR_CODES, localApiErrorResponse } from "../auth/local-api-errors";

type RouteContext = {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  url: URL;
  developerTools: DeveloperToolsService;
  sendJson: (response: http.ServerResponse, status: number, payload: unknown) => void;
  readJsonBody: (request: http.IncomingMessage) => Promise<Record<string, unknown>>;
};

export async function handleDeveloperToolsRoute(
  ctx: RouteContext,
): Promise<boolean> {
  const match = ctx.url.pathname.match(
    /^\/api\/projects\/([^/]+)\/developer-tools(?:\/(.+))?$/,
  );
  if (!match) {
    return false;
  }

  const slug = decodeURIComponent(match[1]!);
  const remainder = match[2] ? decodeURIComponent(match[2]) : "";

  try {
    if (remainder === "scraper" && ctx.request.method === "GET") {
      ctx.sendJson(ctx.response, 200, {
        scraper: ctx.developerTools.getScraperBundle(slug),
      });
      return true;
    }

    if (remainder === "scraper/runtime" && ctx.request.method === "GET") {
      const engineId = ctx.url.searchParams.get("engineId") ?? "";
      if (!engineId) {
        throw new Error("engineId is required.");
      }
      ctx.sendJson(ctx.response, 200, {
        context: ctx.developerTools.getScraperDeveloperContext(slug, engineId),
      });
      return true;
    }

    if (remainder === "scraper/draft" && ctx.request.method === "PUT") {
      const body = await ctx.readJsonBody(ctx.request);
      ctx.sendJson(ctx.response, 200, {
        scraper: ctx.developerTools.saveScraperDraft(slug, {
          baseRevisionId:
            typeof body.baseRevisionId === "string" ? body.baseRevisionId : null,
          source: String(body.source ?? ""),
        }),
      });
      return true;
    }

    if (remainder === "scraper/validate" && ctx.request.method === "POST") {
      const body = await ctx.readJsonBody(ctx.request);
      ctx.sendJson(ctx.response, 200, {
        validation: ctx.developerTools.validateScraperDraft(
          slug,
          typeof body.source === "string" ? body.source : undefined,
        ),
      });
      return true;
    }

    if (remainder === "scraper/publish" && ctx.request.method === "POST") {
      const body = await ctx.readJsonBody(ctx.request);
      const result = await ctx.developerTools.publishScraper(slug, {
        source: String(body.source ?? ""),
        message: typeof body.message === "string" ? body.message : undefined,
        revisionName:
          typeof body.revisionName === "string" ? body.revisionName : undefined,
        changeNote: typeof body.changeNote === "string" ? body.changeNote : undefined,
      });
      ctx.sendJson(ctx.response, 200, result);
      return true;
    }

    if (remainder === "displays" && ctx.request.method === "GET") {
      ctx.sendJson(ctx.response, 200, {
        displays: ctx.developerTools.listDisplays(slug),
      });
      return true;
    }

    if (remainder === "display-version-summaries" && ctx.request.method === "GET") {
      ctx.sendJson(ctx.response, 200, {
        summaries: ctx.developerTools.listDisplayVersionSummaries(slug),
      });
      return true;
    }

    if (remainder === "displays" && ctx.request.method === "POST") {
      const body = await ctx.readJsonBody(ctx.request);
      const result = ctx.developerTools.createDisplay(slug, {
        name: String(body.name ?? ""),
        slug: typeof body.slug === "string" ? body.slug : undefined,
        description:
          typeof body.description === "string" ? body.description : undefined,
        html: typeof body.html === "string" ? body.html : undefined,
        template: typeof body.template === "string" ? body.template : undefined,
        enabled: body.enabled === true,
        refreshRateMs:
          body.refreshRateMs !== undefined ? Number(body.refreshRateMs) : undefined,
        uploadedFilename:
          typeof body.uploadedFilename === "string" ? body.uploadedFilename : undefined,
      });
      ctx.sendJson(ctx.response, 201, result);
      return true;
    }

    if (remainder === "displays/reorder" && ctx.request.method === "POST") {
      const body = await ctx.readJsonBody(ctx.request);
      const displayKeys = Array.isArray(body.displayKeys)
        ? body.displayKeys.filter((entry): entry is string => typeof entry === "string")
        : Array.isArray(body.displayIds)
          ? body.displayIds.filter((entry): entry is string => typeof entry === "string")
          : [];
      ctx.sendJson(ctx.response, 200, ctx.developerTools.reorderDisplays(slug, displayKeys));
      return true;
    }

    const displayMatch = remainder.match(/^displays\/([^/]+)(?:\/(.+))?$/);
    if (displayMatch) {
      const displayId = displayMatch[1]!;
      const action = displayMatch[2] ?? "";

      if (!action && ctx.request.method === "GET") {
        ctx.sendJson(ctx.response, 200, {
          display: ctx.developerTools.getDisplaySource(slug, displayId),
        });
        return true;
      }

      if (action === "draft" && ctx.request.method === "PUT") {
        const body = await ctx.readJsonBody(ctx.request);
        ctx.sendJson(ctx.response, 200, {
          display: ctx.developerTools.saveDisplayDraft(slug, displayId, {
            baseRevisionId:
              typeof body.baseRevisionId === "string" ? body.baseRevisionId : null,
            html: String(body.html ?? ""),
            css: String(body.css ?? ""),
            javascript: String(body.javascript ?? ""),
          }),
        });
        return true;
      }

      if (action === "validate" && ctx.request.method === "POST") {
        const body = await ctx.readJsonBody(ctx.request);
        ctx.sendJson(ctx.response, 200, {
          validation: ctx.developerTools.validateDisplayDraft(slug, displayId, {
            html: String(body.html ?? ""),
            css: String(body.css ?? ""),
            javascript: String(body.javascript ?? ""),
          }),
        });
        return true;
      }

      if (action === "publish" && ctx.request.method === "POST") {
        const body = await ctx.readJsonBody(ctx.request);
        ctx.sendJson(ctx.response, 200, {
          display: ctx.developerTools.publishDisplay(slug, displayId, {
            html: String(body.html ?? ""),
            css: String(body.css ?? ""),
            javascript: String(body.javascript ?? ""),
            message: typeof body.message === "string" ? body.message : undefined,
            revisionName:
              typeof body.revisionName === "string" ? body.revisionName : undefined,
            changeNote: typeof body.changeNote === "string" ? body.changeNote : undefined,
          }),
        });
        return true;
      }

      if (action === "duplicate" && ctx.request.method === "POST") {
        const body = await ctx.readJsonBody(ctx.request);
        const result = ctx.developerTools.duplicateDisplay(slug, displayId, {
          ...(typeof body.name === "string" ? { name: body.name } : {}),
          ...(typeof body.description === "string" ? { description: body.description } : {}),
        });
        ctx.sendJson(ctx.response, 201, result);
        return true;
      }

      if (action === "enabled" && ctx.request.method === "PATCH") {
        const body = await ctx.readJsonBody(ctx.request);
        ctx.sendJson(ctx.response, 200, {
          display: ctx.developerTools.setDisplayEnabled(
            slug,
            displayId,
            body.enabled === true,
          ),
        });
        return true;
      }

      if (action === "archive" && ctx.request.method === "POST") {
        ctx.sendJson(ctx.response, 200, {
          display: ctx.developerTools.archiveDisplay(slug, displayId),
        });
        return true;
      }

      if (action === "rename" && ctx.request.method === "PATCH") {
        const body = await ctx.readJsonBody(ctx.request);
        ctx.sendJson(ctx.response, 200, {
          display: ctx.developerTools.renameDisplay(slug, displayId, {
            name: String(body.name ?? ""),
          }),
        });
        return true;
      }

      if (action === "details" && ctx.request.method === "PATCH") {
        const body = await ctx.readJsonBody(ctx.request);
        ctx.sendJson(ctx.response, 200, {
          display: ctx.developerTools.updateDisplayDetails(slug, displayId, {
            ...(body.name !== undefined ? { name: String(body.name) } : {}),
            ...(body.description !== undefined
              ? { description: typeof body.description === "string" ? body.description : null }
              : {}),
          }),
        });
        return true;
      }

      if (action === "delete" && ctx.request.method === "DELETE") {
        ctx.sendJson(ctx.response, 200, {
          display: ctx.developerTools.deleteDisplay(slug, displayId),
        });
        return true;
      }
    }

    if (remainder === "scraper/restore" && ctx.request.method === "POST") {
      const body = await ctx.readJsonBody(ctx.request);
      const result = await ctx.developerTools.restoreScraperRevision(
        slug,
        String(body.revisionId ?? ""),
        {
          message: typeof body.message === "string" ? body.message : undefined,
          revisionName:
            typeof body.revisionName === "string" ? body.revisionName : undefined,
          changeNote: typeof body.changeNote === "string" ? body.changeNote : undefined,
        },
      );
      ctx.sendJson(ctx.response, 200, result);
      return true;
    }

    const displayRestoreMatch = remainder.match(/^displays\/([^/]+)\/restore$/);
    if (displayRestoreMatch && ctx.request.method === "POST") {
      const body = await ctx.readJsonBody(ctx.request);
      ctx.sendJson(ctx.response, 200, {
        display: ctx.developerTools.restoreDisplayRevision(
          slug,
          displayRestoreMatch[1]!,
          String(body.revisionId ?? ""),
          {
            message: typeof body.message === "string" ? body.message : undefined,
            revisionName:
              typeof body.revisionName === "string" ? body.revisionName : undefined,
            changeNote: typeof body.changeNote === "string" ? body.changeNote : undefined,
          },
        ),
      });
      return true;
    }

    const displayActivateMatch = remainder.match(/^displays\/([^/]+)\/activate-revision$/);
    if (displayActivateMatch && ctx.request.method === "POST") {
      const body = await ctx.readJsonBody(ctx.request);
      ctx.sendJson(ctx.response, 200, {
        display: ctx.developerTools.setActiveDisplayRevision(
          slug,
          displayActivateMatch[1]!,
          String(body.revisionId ?? ""),
        ),
      });
      return true;
    }

    const displayRevisionRenameMatch = remainder.match(
      /^displays\/([^/]+)\/revisions\/([^/]+)\/description$/,
    );
    if (displayRevisionRenameMatch && ctx.request.method === "PATCH") {
      const body = await ctx.readJsonBody(ctx.request);
      ctx.sendJson(
        ctx.response,
        200,
        ctx.developerTools.renameDisplayRevision(
          slug,
          displayRevisionRenameMatch[1]!,
          displayRevisionRenameMatch[2]!,
          { revisionName: String(body.revisionName ?? "") },
        ),
      );
      return true;
    }

    const displayRevisionDeleteMatch = remainder.match(
      /^displays\/([^/]+)\/revisions\/([^/]+)$/,
    );
    if (displayRevisionDeleteMatch && ctx.request.method === "DELETE") {
      ctx.sendJson(ctx.response, 200, {
        result: ctx.developerTools.deleteDisplayRevision(
          slug,
          displayRevisionDeleteMatch[1]!,
          displayRevisionDeleteMatch[2]!,
        ),
      });
      return true;
    }

    if (remainder === "revisions" && ctx.request.method === "GET") {
      const resourceType = ctx.url.searchParams.get("resourceType");
      const resourceId = ctx.url.searchParams.get("resourceId");
      if (resourceType !== "scraper" && resourceType !== "display") {
        throw new Error("resourceType is required.");
      }
      if (!resourceId) {
        throw new Error("resourceId is required.");
      }
      ctx.sendJson(ctx.response, 200, {
        revisions: ctx.developerTools.listRevisions(slug, {
          resourceType,
          resourceId,
        }),
      });
      return true;
    }

    const revisionSourceMatch = remainder.match(/^revisions\/([^/]+)\/source$/);
    if (revisionSourceMatch && ctx.request.method === "GET") {
      ctx.sendJson(ctx.response, 200, {
        source: ctx.developerTools.getRevisionSource(slug, revisionSourceMatch[1]!),
      });
      return true;
    }

    if (remainder === "validation-logs" && ctx.request.method === "GET") {
      ctx.sendJson(ctx.response, 200, {
        logs: ctx.developerTools.listValidationLogs(slug),
      });
      return true;
    }

    ctx.sendJson(
      ctx.response,
      404,
      localApiErrorResponse(
        LOCAL_API_ERROR_CODES.PROJECT_NOT_FOUND,
        "Developer Tools route not found.",
      ),
    );
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Developer Tools request failed.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("owners and admins")
        ? 403
        : message.includes("not found")
          ? 404
          : message.includes("updated by another user")
            ? 409
            : 400;
    const code =
      status === 401
        ? LOCAL_API_ERROR_CODES.AUTH_REQUIRED
        : status === 403
          ? LOCAL_API_ERROR_CODES.FORBIDDEN
          : status === 404
            ? LOCAL_API_ERROR_CODES.PROJECT_NOT_FOUND
            : undefined;
    ctx.sendJson(
      ctx.response,
      status,
      code ? localApiErrorResponse(code, message) : { error: message },
    );
    return true;
  }
}
