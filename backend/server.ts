import express from "express";
import cors from "cors";

import itemRoutes from "./src/routes/item.routes";
import orderRoutes from "./src/routes/order.routes";

const app = express();

const PORT = 5000;

app.use(cors());

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Manufacturing Ordering API"
  });
});

app.use("/api/items", itemRoutes);

app.use("/api/orders", orderRoutes);

app.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );
});