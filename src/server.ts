import express from "express";
import { createInfraiClient } from "./infrai_client.js";
import { createAdminRouter } from "./admin_routes.js";

const app = express();
app.use(express.json());

const infrai = createInfraiClient();
app.use(createAdminRouter(infrai));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Admin DNS service listening on http://localhost:${port}`);
});
