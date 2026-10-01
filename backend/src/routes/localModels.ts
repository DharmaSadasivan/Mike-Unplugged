import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { scanLocalModels } from "../lib/llm/localDiscovery";
import {
    getEnabledLocalModels,
    saveEnabledLocalModels,
} from "../lib/llm/localModels";

// Routes behind the "Scan for local models" window.
//   GET  /local-models/scan?extra=<url>[,<url>]  -> what is running on this computer
//   GET  /local-models/enabled                   -> models the user ticked
//   PUT  /local-models/enabled  { models: [...] } -> save the ticked models
export const localModelsRouter = Router();

localModelsRouter.get("/scan", requireAuth, async (req, res) => {
    const extraParam = req.query.extra;
    const extra = (Array.isArray(extraParam) ? extraParam : [extraParam])
        .filter((v): v is string => typeof v === "string")
        .flatMap((v) => v.split(","))
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 5);
    try {
        const result = await scanLocalModels(extra);
        res.json(result);
    } catch (err) {
        console.error("[local-models/scan]", err);
        res.status(500).json({ detail: "Scan failed" });
    }
});

localModelsRouter.get("/enabled", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    res.json({ models: await getEnabledLocalModels(userId) });
});

localModelsRouter.put("/enabled", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const models = (req.body as { models?: unknown } | undefined)?.models;
    if (!Array.isArray(models)) {
        return void res.status(400).json({ detail: "Body must be { models: [...] }" });
    }
    try {
        const saved = await saveEnabledLocalModels(userId, models);
        res.json({ models: saved });
    } catch (err) {
        console.error("[local-models/enabled]", err);
        res.status(500).json({ detail: "Could not save local models" });
    }
});
