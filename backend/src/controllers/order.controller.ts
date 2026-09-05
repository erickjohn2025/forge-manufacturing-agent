import { Request, Response } from "express";
import pool from "../config/db";

export const createOrder = async (
  req: Request,
  res: Response
): Promise<void> => {

  const { customerId, items } = req.body;

  if (!customerId || !items || items.length === 0) {

    res.status(400).json({
      success: false,
      message: "customerId and items are required"
    });

    return;
  }

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    const customerResult = await client.query(
      "SELECT id FROM customers WHERE id = $1",
      [customerId]
    );

    if (customerResult.rows.length === 0) {

      await client.query("ROLLBACK");

      res.status(404).json({
        success: false,
        message: "Customer not found"
      });

      return;
    }

    const orderResult = await client.query(
      `
      INSERT INTO orders
      (customer_id, status, total_amount)

      VALUES ($1, $2, $3)

      RETURNING *
      `,
      [
        customerId,
        "pending",
        0
      ]
    );

    const order = orderResult.rows[0];

    let totalAmount = 0;

    for (const orderItem of items) {

      const itemResult = await client.query(
        `
        SELECT *
        FROM items
        WHERE id = $1
        `,
        [orderItem.itemId]
      );

      if (itemResult.rows.length === 0) {

        throw new Error(
          `Item ${orderItem.itemId} not found`
        );
      }

      const item = itemResult.rows[0];

      if (orderItem.quantity <= 0) {

        throw new Error(
          "Quantity must be greater than zero"
        );
      }

      if (item.quantity < orderItem.quantity) {

        throw new Error(
          `Insufficient stock for ${item.name}`
        );
      }

      const unitPrice = Number(item.price);

      const subtotal =
        unitPrice * orderItem.quantity;

      totalAmount += subtotal;

      await client.query(
        `
        INSERT INTO order_items
        (
          order_id,
          item_id,
          quantity,
          unit_price,
          subtotal
        )

        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          order.id,
          item.id,
          orderItem.quantity,
          unitPrice,
          subtotal
        ]
      );
    }

    await client.query(
      `
      UPDATE orders

      SET total_amount = $1

      WHERE id = $2
      `,
      [
        totalAmount,
        order.id
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: {
        orderId: order.id,
        customerId,
        totalAmount,
        status: "pending"
      }
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error(error);

    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to create order"
    });

  } finally {

    client.release();

  }
};

export const deleteOrder = async (
  req: Request,
  res: Response
): Promise<void> => {

  const orderId = Number(req.params.id);

  try {

    const result = await pool.query(
      `
      DELETE FROM orders

      WHERE id = $1

      RETURNING *
      `,
      [orderId]
    );

    if (result.rows.length === 0) {

      res.status(404).json({
        success: false,
        message: "Order not found"
      });

      return;
    }

    res.status(200).json({
      success: true,
      message: "Order deleted successfully"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to delete order"
    });

  }
};

export const updateOrder = async (
  req: Request,
  res: Response
): Promise<void> => {

  const orderId = Number(req.params.id);

  const { status } = req.body;

  const allowedStatuses = [
    "pending",
    "confirmed",
    "processing",
    "completed",
    "cancelled"
  ];

  if (!allowedStatuses.includes(status)) {

    res.status(400).json({
      success: false,
      message: "Invalid order status"
    });

    return;
  }

  try {

    const result = await pool.query(
      `
      UPDATE orders

      SET status = $1

      WHERE id = $2

      RETURNING *
      `,
      [
        status,
        orderId
      ]
    );

    if (result.rows.length === 0) {

      res.status(404).json({
        success: false,
        message: "Order not found"
      });

      return;
    }

    res.status(200).json({
      success: true,
      message: "Order updated successfully",
      data: result.rows[0]
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to update order"
    });

  }
};

export const getOrders = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const result = await pool.query(`
      SELECT
        o.id,
        o.status,
        o.total_amount,
        o.created_at,

        c.id AS customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone

      FROM orders o

      JOIN customers c
        ON o.customer_id = c.id

      ORDER BY o.id DESC
    `);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch orders"
    });

  }
};