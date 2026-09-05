import { Router } from "express";
import { getItems } from "../controllers/item.controller";

const router = Router();

router.get("/", getItems);

export default router;