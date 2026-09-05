Client submits order
        ↓
PENDING
        ↓
Company reviews
        ↓
CONFIRMED
        ↓
Reserve / reduce stock
        ↓
PROCESSING
        ↓
Manufacturing / dispatch
        ↓
COMPLETED

# Create customers
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

# Create Item
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price NUMERIC(12,2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

# Create Orders
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,

    customer_id INTEGER NOT NULL,

    status VARCHAR(50) DEFAULT 'pending',

    total_amount NUMERIC(12,2) DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
);

# create order items
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,

    order_id INTEGER NOT NULL,

    item_id INTEGER NOT NULL,

    quantity INTEGER NOT NULL,

    unit_price NUMERIC(12,2) NOT NULL,

    subtotal NUMERIC(12,2) NOT NULL,

    CONSTRAINT fk_order
        FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_item
        FOREIGN KEY (item_id)
        REFERENCES items(id)
);


# Create a new customer
INSERT INTO customers
(name, phone, email)
VALUES
(
    'ABC Construction Ltd',
    '0712345678',
    'abc@example.com'
);

# Dumby data
-- CUSTOMERS
INSERT INTO customers (name, phone, email)
VALUES
('ABC Construction Ltd', '0712345678', 'abc@construction.co.tz'),
('Mlimani Hardware', '0755123456', 'sales@mlimanihardware.co.tz'),
('Kariakoo Builders', '0788123456', 'info@kariaakoobuilders.co.tz'),
('Upanga Engineering', '0766123456', 'orders@upangaengineering.co.tz'),
('Masaki Developers', '0744123456', 'procurement@masakidevelopers.co.tz');


-- ITEMS
INSERT INTO items (name, description, price, quantity)
VALUES
('Steel Bar 8mm', '8mm reinforcement steel bar', 18000, 250),
('Steel Bar 10mm', '10mm reinforcement steel bar', 22000, 200),
('Steel Bar 12mm', '12mm reinforcement steel bar', 25000, 180),
('Steel Bar 16mm', '16mm reinforcement steel bar', 35000, 120),
('Steel Bar 20mm', '20mm reinforcement steel bar', 47000, 90),
('Steel Sheet 1.5mm', 'General purpose steel sheet 1.5mm', 75000, 60),
('Steel Sheet 2mm', 'General purpose steel sheet 2mm', 92000, 50),
('Binding Wire', 'Construction binding wire roll', 28000, 150),
('Angle Bar 40x40', 'Mild steel angle bar 40x40mm', 32000, 100),
('Square Tube 40x40', 'Mild steel square tube 40x40mm', 38000, 80);


-- ORDERS
INSERT INTO orders (customer_id, status, total_amount)
VALUES
(1, 'pending', 425000),
(2, 'confirmed', 510000),
(3, 'processing', 372000),
(4, 'completed', 610000),
(5, 'cancelled', 176000);


-- ORDER 1 ITEMS
INSERT INTO order_items
(order_id, item_id, quantity, unit_price, subtotal)
VALUES
(1, 3, 10, 25000, 250000),
(1, 4, 5, 35000, 175000);


-- ORDER 2 ITEMS
INSERT INTO order_items
(order_id, item_id, quantity, unit_price, subtotal)
VALUES
(2, 2, 10, 22000, 220000),
(2, 8, 5, 28000, 140000),
(2, 1, 5, 18000, 90000),
(2, 9, 2, 30000, 60000);


-- ORDER 3 ITEMS
INSERT INTO order_items
(order_id, item_id, quantity, unit_price, subtotal)
VALUES
(3, 6, 2, 75000, 150000),
(3, 9, 4, 32000, 128000),
(3, 10, 2, 38000, 76000),
(3, 1, 1, 18000, 18000);


-- ORDER 4 ITEMS
INSERT INTO order_items
(order_id, item_id, quantity, unit_price, subtotal)
VALUES
(4, 5, 5, 47000, 235000),
(4, 7, 3, 92000, 276000),
(4, 8, 2, 28000, 56000),
(4, 1, 2, 18000, 36000),
(4, 9, 1, 7000, 7000);


-- ORDER 5 ITEMS
INSERT INTO order_items
(order_id, item_id, quantity, unit_price, subtotal)
VALUES
(5, 2, 4, 22000, 88000),
(5, 8, 2, 28000, 56000),
(5, 9, 1, 32000, 32000);