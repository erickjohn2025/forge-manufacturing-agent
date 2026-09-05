import { Router } from "express";

import {
  createOrder,
  getOrders,
  updateOrder,
  deleteOrder
} from "../controllers/order.controller";

const router = Router();

router.get("/", getOrders);

router.post("/", createOrder);

router.put("/:id", updateOrder);

router.delete("/:id", deleteOrder);

export default router;