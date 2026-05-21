import fastify from "fastify";
import path from "path";
import { fileURLToPath } from "url";
import { AsyncDatabase } from "promised-sqlite3";

const server = fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

const PORT = process.env.PORT || 3000;
const HOST = ("RENDER" in process.env) ? `0.0.0.0` : `localhost`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = await AsyncDatabase.open("./pizza.sqlite");

server.addHook('preHandler', (req, res, done) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST");
    res.header("Access-Control-Allow-Headers",  "*");

  const isPreflight = /options/i.test(req.method);
  if (isPreflight) {
    return res.send();
  }
  done();
})

server.get("/api/pizzas", async function getPizzas(req, res) {
  const pizzasPromise = db.all(
    "SELECT pizza_type_id, name, category, ingredients as description FROM pizza_types"
  );
  const pizzaSizesPromise = db.all(
    `SELECT 
      pizza_type_id as id, size, price
    FROM 
      pizzas
  `
  );

  const [pizzas, pizzaSizes] = await Promise.all([
    pizzasPromise,
    pizzaSizesPromise,
  ]);

  const responsePizzas = pizzas.map((pizza) => {
    const sizes = pizzaSizes.reduce((acc, current) => {
      if (current.id === pizza.pizza_type_id) {
        acc[current.size] = +current.price;
      }
      return acc;
    }, {});
    return {
      id: pizza.pizza_type_id,
      name: pizza.name,
      category: pizza.category,
      description: pizza.description,
      image: `/pizzas/${pizza.pizza_type_id}.webp`,
      sizes,
    };
  });

  res.send(responsePizzas);
});

server.get("/api/pizza-of-the-day", async function getPizzaOfTheDay(req, res) {
  const pizzas = await db.all(
    `SELECT 
      pizza_type_id as id, name, category, ingredients as description
    FROM 
      pizza_types`
  );

  const daysSinceEpoch = Math.floor(Date.now() / 86400000);
  const pizzaIndex = daysSinceEpoch % pizzas.length;
  const pizza = pizzas[pizzaIndex];

  const sizes = await db.all(
    `SELECT
      size, price
    FROM
      pizzas
    WHERE
      pizza_type_id = ?`,
    [pizza.id]
  );

  const sizeObj = sizes.reduce((acc, current) => {
    acc[current.size] = +current.price;
    return acc;
  }, {});

  const responsePizza = {
    id: pizza.id,
    name: pizza.name,
    category: pizza.category,
    description: pizza.description,
    image: `/pizzas/${pizza.id}.webp`,
    sizes: sizeObj,
  };

  res.send(responsePizza);
});

server.get("/api/orders", async function getOrders(req, res) {
  const id = req.query.id;
  const orders = await db.all("SELECT order_id, date, time FROM orders");

  res.send(orders);
});

server.get("/api/order", async function getOrders(req, res) {
  const id = req.query.id;
  const orderPromise = db.get(
    "SELECT order_id, date, time FROM orders WHERE order_id = ?",
    [id]
  );
  const orderItemsPromise = db.all(
    `SELECT 
      t.pizza_type_id as pizzaTypeId, t.name, t.category, t.ingredients as description, o.quantity, p.price, o.quantity * p.price as total, p.size
    FROM 
      order_details o
    JOIN
      pizzas p
    ON
      o.pizza_id = p.pizza_id
    JOIN
      pizza_types t
    ON
      p.pizza_type_id = t.pizza_type_id
    WHERE 
      order_id = ?`,
    [id]
  );

  const [order, orderItemsRes] = await Promise.all([
    orderPromise,
    orderItemsPromise,
  ]);

  const orderItems = orderItemsRes.map((item) =>
    Object.assign({}, item, {
      image: `/pizzas/${item.pizzaTypeId}.webp`,
      quantity: +item.quantity,
      price: +item.price,
    })
  );

  const total = orderItems.reduce((acc, item) => acc + item.total, 0);

  res.send({
    order: Object.assign({ total }, order),
    orderItems,
  });
});

server.post("/api/order", async function createOrder(req, res) {
  const { cart } = req.body;

  const now = new Date();
  // forgive me Date gods, for I have sinned
  const time = now.toLocaleTimeString("en-US", { hour12: false });
  const date = now.toISOString().split("T")[0];

  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    res.status(400).send({ error: "Invalid order data" });
    return;
  }

  try {
    await db.run("BEGIN TRANSACTION");

    const result = await db.run(
      "INSERT INTO orders (date, time) VALUES (?, ?)",
      [date, time]
    );
    const orderId = result.lastID;

    const mergedCart = cart.reduce((acc, item) => {
      const id = item.pizza.id;
      const size = item.size.toLowerCase();
      if (!id || !size) {
        throw new Error("Invalid item data");
      }
      const pizzaId = `${id}_${size}`;

      if (!acc[pizzaId]) {
        acc[pizzaId] = { pizzaId, quantity: 1 };
      } else {
        acc[pizzaId].quantity += 1;
      }

      return acc;
    }, {});

    for (const item of Object.values(mergedCart)) {
      const { pizzaId, quantity } = item;
      await db.run(
        "INSERT INTO order_details (order_id, pizza_id, quantity) VALUES (?, ?, ?)",
        [orderId, pizzaId, quantity]
      );
    }

    await db.run("COMMIT");

    res.send({ orderId });
  } catch (error) {
    req.log.error(error);
    await db.run("ROLLBACK");
    res.status(500).send({ error: "Failed to create order" });
  }
});

server.get("/api/past-orders", async function getPastOrders(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const pastOrders = await db.all(
      "SELECT order_id, date, time FROM orders ORDER BY order_id DESC LIMIT 10 OFFSET ?",
      [offset]
    );
    res.send(pastOrders);
  } catch (error) {
    req.log.error(error);
    res.status(500).send({ error: "Failed to fetch past orders" });
  }
});

server.get("/api/past-order/:order_id", async function getPastOrder(req, res) {
  const orderId = req.params.order_id;

  try {
    const order = await db.get(
      "SELECT order_id, date, time FROM orders WHERE order_id = ?",
      [orderId]
    );

    if (!order) {
      res.status(404).send({ error: "Order not found" });
      return;
    }

    const orderItems = await db.all(
      `SELECT 
        t.pizza_type_id as pizzaTypeId, t.name, t.category, t.ingredients as description, o.quantity, p.price, o.quantity * p.price as total, p.size
      FROM 
        order_details o
      JOIN
        pizzas p
      ON
        o.pizza_id = p.pizza_id
      JOIN
        pizza_types t
      ON
        p.pizza_type_id = t.pizza_type_id
      WHERE 
        order_id = ?`,
      [orderId]
    );

    const formattedOrderItems = orderItems.map((item) =>
      Object.assign({}, item, {
        image: `/pizzas/${item.pizzaTypeId}.webp`,
        quantity: +item.quantity,
        price: +item.price,
      })
    );

    const total = formattedOrderItems.reduce(
      (acc, item) => acc + item.total,
      0
    );

    res.send({
      order: Object.assign({ total }, order),
      orderItems: formattedOrderItems,
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).send({ error: "Failed to fetch order" });
  }
});

// ============================================================
// Agentforce Agent API Proxy Routes
// ============================================================
const SF_MY_DOMAIN_URL = process.env.SF_MY_DOMAIN_URL;
const SF_CONSUMER_KEY = process.env.SF_CONSUMER_KEY;
const SF_CONSUMER_SECRET = process.env.SF_CONSUMER_SECRET;
const SF_AGENT_ID = process.env.SF_AGENT_ID;

const SF_AGENT_API_BASE = "https://api.salesforce.com";

// In-memory token cache
let sfTokenCache = { token: null, expiresAt: 0 };

async function getSalesforceToken() {
  if (sfTokenCache.token && Date.now() < sfTokenCache.expiresAt - 60000) {
    return sfTokenCache.token;
  }

  const tokenUrl = `${SF_MY_DOMAIN_URL}/services/oauth2/token`;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: SF_CONSUMER_KEY,
    client_secret: SF_CONSUMER_SECRET,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Token request failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  sfTokenCache = {
    token: data.access_token,
    expiresAt: (parseInt(data.issued_at, 10) || Date.now()) + 7200000,
  };

  return sfTokenCache.token;
}

// POST /api/agent/session
server.post("/api/agent/session", async function startAgentSession(req, res) {
  try {
    if (!SF_MY_DOMAIN_URL || !SF_CONSUMER_KEY || !SF_CONSUMER_SECRET || !SF_AGENT_ID) {
      return res.status(500).send({
        error: "Salesforce Agent API is not configured.",
      });
    }

    const token = await getSalesforceToken();
    const sessionKey = crypto.randomUUID();

    const agentUrl = `${SF_AGENT_API_BASE}/einstein/ai-agent/v1/agents/${SF_AGENT_ID}/sessions`;

    const response = await fetch(agentUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-session-key": sessionKey,
      },
      body: JSON.stringify({
        externalSessionKey: sessionKey,
        instanceConfig: {
          endpoint: SF_MY_DOMAIN_URL,
        },
        streamingCapabilities: {
          chunkTypes: ["Text"],
        },
        bypassUser: true,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      req.log.error(`Agent session start failed: ${errBody}`);
      return res.status(response.status).send({
        error: "Failed to start agent session",
        details: errBody,
      });
    }

    const data = await response.json();
    res.send({
      sessionId: data.sessionId,
      externalSessionKey: sessionKey,
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).send({ error: "Failed to start agent session" });
  }
});

// POST /api/agent/message
server.post("/api/agent/message", async function sendAgentMessage(req, res) {
  try {
    const { sessionId, message, sequenceId } = req.body;

    if (!sessionId || !message) {
      return res.status(400).send({ error: "sessionId and message are required" });
    }

    const token = await getSalesforceToken();
    const msgUrl = `${SF_AGENT_API_BASE}/einstein/ai-agent/v1/sessions/${sessionId}/messages`;

    const response = await fetch(msgUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        message: {
          sequenceId: sequenceId || 1,
          type: "Text",
          text: message,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      req.log.error(`Agent message failed: ${errBody}`);
      return res.status(response.status).send({
        error: "Failed to send message to agent",
        details: errBody,
      });
    }

    const data = await response.json();

    let agentReply = "";
    if (data.messages && Array.isArray(data.messages)) {
      for (const msg of data.messages) {
        if (msg.type === "Inform" && msg.message) {
          agentReply += msg.message;
        } else if (msg.type === "Text" && msg.text) {
          agentReply += msg.text;
        }
      }
    }

    res.send({
      reply: agentReply || "The agent did not return a response.",
      raw: data,
    });
  } catch (error) {
    req.log.error(error);
    res.status(500).send({ error: "Failed to send message to agent" });
  }
});

// POST /api/agent/message/stream
server.post("/api/agent/message/stream", async function streamAgentMessage(req, res) {
  try {
    const { sessionId, message, sequenceId } = req.body;

    if (!sessionId || !message) {
      return res.status(400).send({ error: "sessionId and message are required" });
    }

    const token = await getSalesforceToken();
    const msgUrl = `${SF_AGENT_API_BASE}/einstein/ai-agent/v1/sessions/${sessionId}/messages/stream`;

    const response = await fetch(msgUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        message: {
          sequenceId: sequenceId || 1,
          type: "Text",
          text: message,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      req.log.error(`Agent stream failed: ${errBody}`);
      return res.status(response.status).send({
        error: "Failed to stream message from agent",
        details: errBody,
      });
    }

    res.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.raw.write(decoder.decode(value, { stream: true }));
      }
    } catch (streamErr) {
      req.log.error("Stream reading error:", streamErr);
    } finally {
      res.raw.end();
    }
  } catch (error) {
    req.log.error(error);
    res.status(500).send({ error: "Failed to stream agent message" });
  }
});

// POST /api/agent/end
server.post("/api/agent/end", async function endAgentSession(req, res) {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).send({ error: "sessionId is required" });
    }

    const token = await getSalesforceToken();
    const endUrl = `${SF_AGENT_API_BASE}/einstein/ai-agent/v1/sessions/${sessionId}`;

    const response = await fetch(endUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-session-key": sessionId,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      req.log.error(`Agent session end failed: ${errBody}`);
      return res.status(response.status).send({
        error: "Failed to end agent session",
        details: errBody,
      });
    }

    res.send({ success: true });
  } catch (error) {
    req.log.error(error);
    res.status(500).send({ error: "Failed to end agent session" });
  }
});

// POST /api/agent/feedback
server.post("/api/agent/feedback", async function submitAgentFeedback(req, res) {
  try {
    const { sessionId, feedbackType, feedbackText } = req.body;

    if (!sessionId || !feedbackType) {
      return res.status(400).send({ error: "sessionId and feedbackType are required" });
    }

    const token = await getSalesforceToken();
    const feedbackUrl = `${SF_AGENT_API_BASE}/einstein/ai-agent/v1/sessions/${sessionId}/feedback`;

    const response = await fetch(feedbackUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        feedbackType,
        feedbackText: feedbackText || "",
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      req.log.error(`Agent feedback failed: ${errBody}`);
      return res.status(response.status).send({
        error: "Failed to submit feedback",
        details: errBody,
      });
    }

    res.status(201).send({ success: true });
  } catch (error) {
    req.log.error(error);
    res.status(500).send({ error: "Failed to submit feedback" });
  }
});

server.post("/api/contact", async function contactForm(req, res) {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    res.status(400).send({ error: "All fields are required" });
    return;
  }

  req.log.info(`Contact Form Submission:
    Name: ${name}
    Email: ${email}
    Message: ${message}
  `);

  res.send({ success: "Message received" });
});

const start = async () => {
  try {
    await server.listen({ host: HOST, port: PORT });
    console.log(`Server listening on port ${PORT}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();