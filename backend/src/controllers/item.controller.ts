import { Request, Response } from "express";
import pool from "../config/db";

export const getItems = async (
  req: Request,
  res: Response
): Promise<void> => {

  try {

    const result = await pool.query(`
      SELECT
        id,
        name,
        description,
        price,
        quantity
      FROM items
      ORDER BY id ASC
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
      message: "Failed to fetch items"
    });

  }
};