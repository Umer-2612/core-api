import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { ReportFocusLossDto } from "@modules/portal/portal.dto";
import { PortalService } from "@modules/portal/portal.service";
import type { SaveBoardDto, SimulateDto, SubmitSystemDesignDto } from "@modules/portal/system-design/schemas";
import { SystemDesignPortalService } from "@modules/portal/system-design/system-design.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

/** NDJSON writer that only commits headers on the first line, so a failure before anything was
 * streamed (bad token, round not started, ...) still goes through the normal JSON error middleware. */
function ndjson(res: Response) {
  let started = false;
  const alive = () => !res.writableEnded && !res.destroyed;
  return {
    get started() {
      return started;
    },
    write(line: Record<string, unknown>) {
      if (!alive()) return;
      if (!started) {
        started = true;
        res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
      }
      res.write(`${JSON.stringify(line)}\n`);
    },
    end() {
      if (alive()) res.end();
    },
  };
}

@injectable()
export class SystemDesignPortalController {
  private readonly service: SystemDesignPortalService;
  private readonly portalService: PortalService;

  constructor() {
    this.service = container.resolve(SystemDesignPortalService);
    this.portalService = container.resolve(PortalService);
  }

  public getRound: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const round = await this.service.getRound(req.params.token as string);
    res.status(200).json({ data: round, message: "system design round" });
  });

  public startRound: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.service.startRound(req.params.token as string);
    res.status(200).json({ data: result, message: "system design round started" });
  });

  public saveBoard: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { board } = req.body as SaveBoardDto;
    await this.service.saveBoard(req.params.token as string, board);
    res.status(200).json({ data: { saved_at: new Date().toISOString() }, message: "board saved" });
  });

  /** Streams `engine` immediately, then `ai_hint` / `ai_skipped`, then `done`. If the candidate
   * navigates away mid-stream the AI call is cancelled and its hint run is given back. */
  public simulate: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { board, scenario } = req.body as SimulateDto;
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const out = ndjson(res);
    try {
      await this.service.simulate(req.params.token as string, board, scenario, (event) => out.write(event), controller.signal);
      out.end();
    } catch (err) {
      if (!out.started) throw err;
      out.write({ type: "error", message: err instanceof Error ? err.message : "Simulation failed" });
      out.end();
    }
  });

  /** Like a DSA submit, deliberately not abortable: the submission is final and must finish and
   * save even if the tab closes mid-stream (e.g. the timer-expiry auto-submit). */
  public submit: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const { board } = req.body as SubmitSystemDesignDto;
    const out = ndjson(res);
    try {
      await this.service.submit(req.params.token as string, board, (event) => out.write(event));
      out.end();
    } catch (err) {
      if (!out.started) throw err;
      out.write({ type: "error", message: err instanceof Error ? err.message : "Submission failed" });
      out.end();
    }
  });

  public reportFocusLoss: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.portalService.reportFocusLoss(req.params.token as string, req.body as ReportFocusLossDto, "system_design");
    res.status(200).json({ data: result, message: "focus loss recorded" });
  });
}
