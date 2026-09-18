import type { Request, RequestHandler, Response } from "express";
import { container, injectable } from "tsyringe";
import { CompaniesService } from "@modules/companies/companies.service";
import { asyncHandler } from "@shared/utils/asyncHandler";

@injectable()
export class CompaniesController {
  private readonly companiesService: CompaniesService;

  constructor() {
    this.companiesService = container.resolve(CompaniesService);
  }

  public list: RequestHandler = asyncHandler(async (_req: Request, res: Response) => {
    const companies = await this.companiesService.list();
    res.status(200).json({ data: companies, message: "companies" });
  });

  public getById: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const company = await this.companiesService.getByIdOrThrow(req.params.id as string);
    res.status(200).json({ data: company, message: "company" });
  });

  public listUsers: RequestHandler = asyncHandler(async (req: Request, res: Response) => {
    const users = await this.companiesService.listUsers(req.params.id as string);
    res.status(200).json({ data: users, message: "company users" });
  });
}
