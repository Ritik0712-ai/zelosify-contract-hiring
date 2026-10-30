// Core Express and Node.js libraries
import express from "express";
import "dotenv/config";

// Authentication and session management
import { setupKeycloakConfig } from "./config/keycloak/keycloak.js";

// Security and middleware libraries
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

// Database connection utilities
import connectPrisma from "./utils/prisma/connectPrisma.js";

// Application route handlers organized by feature domain
import authRoutes from "./routers/auth/authRoute.js";
import vendorRoutes from "./routers/vendor/vendorRoutes.js";
import hiringManagerRoutes from "./routers/hiring/hiringManagerRoutes.js";
import {contractRoutes} from "./routers/hiring/contractRoutes.js";

import prisma from './config/prisma/prisma.js';
import {S3DocumentStore} from './services/hiring/storage.js';
import {RecommendationWorker} from './services/recommendation/worker.js';
// Load environment variables from .env file

// Initialize Express application
const app = express();

/**
 * Main server initialization function
 * Sets up middleware, database connections, routes, and starts the server
 */
async function startServer() {
  try {
    // Initialize Keycloak authentication and session store
    await setupKeycloakConfig();

    // Establish database connections
    await connectPrisma();

    if(process.env.AI_WORKER_ENABLED!=='false'){
      const worker=new RecommendationWorker(prisma,new S3DocumentStore());worker.start();
      for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void worker.stop().finally(()=>process.exit(0));});
    }
    // Security middleware for headers and protection
    app.use(helmet());
    app.use(express.json());
    app.use(cookieParser());

    // Cross-Origin Resource Sharing configuration
    // Allows requests from specified frontend origins during development
    app.use(
      cors({
        origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
        exposedHeaders: ["set-cookie"],
      })
    );

    app.use((req,res,next)=>{
      const started=performance.now(), path=req.path;
      res.on('finish',()=>console.log(JSON.stringify({timestamp:new Date().toISOString(),event:'http.request',method:req.method,path,status:res.statusCode,latencyMs:Math.round(performance.now()-started)})));
      next();
    });

    // Mount API route handlers with versioned endpoints

    // User authentication and authorization
    app.use("/api/v1/auth", authRoutes);

    // Files are exposed only through the tenant-scoped hiring routes.

    app.use(["/api/vendor", "/api/v1/vendor"], contractRoutes("IT_VENDOR"));
    app.use(["/api/hiring-manager", "/api/v1/hiring-manager"], contractRoutes("HIRING_MANAGER"));

    // Handles vendor-specific routes
    app.use("/api/v1/vendor", vendorRoutes);

    // Hiring manager routes
    app.use("/api/v1/hiring-manager", hiringManagerRoutes);


    // Health check endpoint
    app.get("/", (_, res) => {
      res.send("Server Connected!");
    });

    // Global error handling middleware
    // Catches and handles all unhandled errors in the application
    app.use(
      (
        err: Error,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        const status=(err as any).status;
        if(status===400||status===413){res.status(status).json({message:status===413?"Request is too large.":"Invalid request body."});return;}
        console.error(JSON.stringify({event:"http.unhandled_error",error:err.name}));
        res.status(500).json({message:"Internal server error."});
      }
    );

    // Start the server on specified port
    const PORT = process.env.PORT || 5000;

    app.listen(Number(PORT), process.env.HOST || "127.0.0.1", () => {
      console.log(JSON.stringify({event:'server.listening',port:PORT}));
    });
  } catch (error) {
    // Handle server initialization errors
    console.error(JSON.stringify({event:'server.start.failed',error:error instanceof Error?error.name:'UnknownError'}));
    process.exit(1);
  }
}

// Start the server
await startServer();
