import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import type { RunDsaTestsDto, SubmitDsaQuestionDto } from "@modules/portal/portal.dto";
import { PortalService } from "@modules/portal/portal.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class PortalController {
  private readonly portalService: PortalService;

  constructor() {
    this.portalService = container.resolve(PortalService);
  }

  public getPortal: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const portal = await this.portalService.getPortal(req.params.token as string);
    res.status(200).json({ data: portal, message: "interview portal" });
  });

  public getDsaRound: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const round = await this.portalService.getDsaRound(req.params.token as string);
    res.status(200).json({ data: round, message: "dsa round" });
  });

  public startDsaRound: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.portalService.startDsaRound(req.params.token as string);
    res.status(200).json({ data: result, message: "dsa round started" });
  });

  /** Streams one NDJSON line per test case as it finishes grading, instead of making
   * the candidate wait for all 15-20 to complete before seeing anything. Headers are
   * only sent once the first result is ready, so a validation failure (bad token,
   * round not started, ...) before any case has run still reaches the normal JSON
   * error middleware; a failure mid-stream (after headers are committed) can't use
   * that path anymore, so it's reported as its own NDJSON line instead. */
  public runDsaTests: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const questionId = req.params.questionId as string;
    const dto = req.body as RunDsaTestsDto;

    let headersSent = false;

    try {
      const result = await this.portalService.runDsaTests(token, questionId, dto, (index, gradedResult) => {
        if (!headersSent) {
          headersSent = true;
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
          });
        }
        res.write(`${JSON.stringify({ type: "result", index, result: gradedResult })}\n`);
      });

      if (!headersSent) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      }
      res.write(`${JSON.stringify({ type: "done", passed: result.passed, total: result.total })}\n`);
      res.end();
    } catch (err) {
      if (!headersSent) throw err;
      res.write(`${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Grading failed" })}\n`);
      res.end();
    }
  });

  public submitDsaQuestion: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const submission = await this.portalService.submitDsaQuestion(
      req.params.token as string,
      req.params.questionId as string,
      req.body as SubmitDsaQuestionDto,
    );
    res.status(200).json({ data: submission, message: "question submitted" });
  });
}
