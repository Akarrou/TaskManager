const express = require("express");
const cors = require("cors");
const redis = require("redis");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration du projet
const PROJECT_NAME = process.env.PROJECT_NAME || "MyProject";
const PROJECT_FULL_NAME = `${PROJECT_NAME} Task Manager`;

// Configuration Redis avec variables d'environnement
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const redisClient = redis.createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes HTML avec injection du PROJECT_NAME (AVANT express.static)
// Route pour injecter la configuration du projet dans les pages HTML
app.get("/", (req, res) => {
  console.log(`📄 Route '/' appelée - PROJECT_NAME: ${PROJECT_NAME}`);
  const fs = require("fs");
  let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  
  // Injecter la variable PROJECT_NAME
  console.log(`🔧 Remplacement: window.PROJECT_NAME = "${PROJECT_NAME}";`);
  html = html.replace(
    'window.PROJECT_NAME = window.PROJECT_NAME || "MyProject";',
    `window.PROJECT_NAME = "${PROJECT_NAME}";`
  );
  
  // Remplacer le placeholder dans le HTML si présent
  html = html.replace(/__PROJECT_NAME_H1_PLACEHOLDER__/g, PROJECT_NAME);
  
  res.send(html);
});

app.get("/edit.html", (req, res) => {
  console.log(`📄 Route '/edit.html' appelée - PROJECT_NAME: ${PROJECT_NAME}`);
  const fs = require("fs");
  let html = fs.readFileSync(path.join(__dirname, "edit.html"), "utf8");
  
  // Injecter la variable PROJECT_NAME
  html = html.replace(
    'window.PROJECT_NAME = window.PROJECT_NAME || "MyProject";',
    `window.PROJECT_NAME = "${PROJECT_NAME}";`
  );
  
  // Remplacer le placeholder dans le HTML si présent
  html = html.replace(/__PROJECT_NAME_H1_PLACEHOLDER__/g, PROJECT_NAME);
  
  res.send(html);
});

// Route générale pour tous les fichiers HTML avec injection du PROJECT_NAME
app.get("*.html", (req, res) => {
  console.log(`📄 Route générale '*.html' appelée pour ${req.path} - PROJECT_NAME: ${PROJECT_NAME}`);
  const fs = require("fs");
  const filePath = path.join(__dirname, req.path);
  
  // Vérifier si le fichier existe
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier non trouvé" });
  }
  
  let html = fs.readFileSync(filePath, "utf8");
  
  // Injecter la variable PROJECT_NAME
  html = html.replace(
    'window.PROJECT_NAME = window.PROJECT_NAME || "MyProject";',
    `window.PROJECT_NAME = "${PROJECT_NAME}";`
  );
  
  // Remplacer tous les placeholders dans le HTML
  html = html.replace(/__PROJECT_NAME_H1_PLACEHOLDER__/g, PROJECT_NAME);
  html = html.replace(/__PROJECT_NAME__/g, PROJECT_NAME);
  html = html.replace(/__PROJECT_FULL_NAME__/g, PROJECT_FULL_NAME);
  
  res.send(html);
});

// Middleware pour les fichiers statiques (APRÈS les routes HTML)
app.use(express.static(path.join(__dirname)));

// Connexion Redis avec gestion d'erreurs
redisClient.on("error", (err) => {
  console.error("Erreur Redis:", err);
});

redisClient.on("connect", () => {
  console.log("✅ Connecté à Redis");
});

// Route de santé
app.get("/api/health", async (req, res) => {
  try {
    await redisClient.ping();
    res.json({ status: "ok", redis: "connected" });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", redis: "disconnected", error: error.message });
  }
});

// Récupérer toutes les tâches
app.get("/api/tasks", async (req, res) => {
  try {
    // Récupérer toutes les clés de tâches
    const taskKeys = await redisClient.keys("tasks:*");
    const tasks = [];

    for (const key of taskKeys) {
      // Ignorer l'index
      if (key === "tasks:index") continue;

      try {
        const taskData = await redisClient.sendCommand(["JSON.GET", key]);
        if (taskData) {
          tasks.push(JSON.parse(taskData));
        }
      } catch (error) {
        console.error(`Erreur lors de la récupération de ${key}:`, error);
      }
    }

    // Trier par ID
    tasks.sort((a, b) => a.id - b.id);
    res.json(tasks);
  } catch (error) {
    console.error("Erreur lors de la récupération des tâches:", error);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération des tâches" });
  }
});

// Récupérer une tâche spécifique
app.get("/api/tasks/:id", async (req, res) => {
  try {
    const taskId = req.params.id;
    const taskData = await redisClient.sendCommand([
      "JSON.GET",
      `tasks:${taskId}`,
    ]);

    if (!taskData) {
      return res.status(404).json({ error: "Tâche non trouvée" });
    }

    res.json(JSON.parse(taskData));
  } catch (error) {
    console.error(
      `Erreur lors de la récupération de la tâche ${req.params.id}:`,
      error
    );
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération de la tâche" });
  }
});

// Récupérer l'index des tâches
app.get("/api/tasks/index", async (req, res) => {
  try {
    const indexData = await redisClient.sendCommand([
      "JSON.GET",
      "tasks:index",
    ]);

    if (!indexData) {
      // Créer un index par défaut si il n'existe pas
      const defaultIndex = {
        total_tasks: 0,
        status_breakdown: {
          "À faire": 0,
          "En cours": 0,
          Terminée: 0,
          "En attente": 0,
          Annulée: 0,
        },
        priority_breakdown: {
          Haute: 0,
          Moyenne: 0,
          Basse: 0,
        },
        category_breakdown: {
          Frontend: 0,
          Backend: 0,
          Fullstack: 0,
          Testing: 0,
          OPS: 0,
        },
        last_updated: new Date().toISOString(),
      };
      return res.json(defaultIndex);
    }

    res.json(JSON.parse(indexData));
  } catch (error) {
    console.error("Erreur lors de la récupération de l'index:", error);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération de l'index" });
  }
});

// Mettre à jour le statut d'une tâche
app.put("/api/tasks/:id/status", async (req, res) => {
  try {
    const taskId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Le statut est requis" });
    }

    // Vérifier si la tâche existe
    const existingTask = await redisClient.sendCommand([
      "JSON.GET",
      `tasks:${taskId}`,
    ]);
    if (!existingTask) {
      return res.status(404).json({ error: "Tâche non trouvée" });
    }

    // Mettre à jour le statut
    await redisClient.sendCommand([
      "JSON.SET",
      `tasks:${taskId}`,
      "$.status",
      `"${status}"`,
    ]);

    // Mettre à jour le timestamp
    const now = new Date().toISOString();
    await redisClient.sendCommand([
      "JSON.SET",
      `tasks:${taskId}`,
      "$.updated_at",
      `"${now}"`,
    ]);

    // Si la tâche est terminée ou annulée, mettre à jour completed_at
    if (status === "Terminée" || status === "Annulée") {
      await redisClient.sendCommand([
        "JSON.SET",
        `tasks:${taskId}`,
        "$.completed_at",
        `"${now}"`,
      ]);
    } else {
      await redisClient.sendCommand([
        "JSON.SET",
        `tasks:${taskId}`,
        "$.completed_at",
        "null",
      ]);
    }

    // Recalculer et mettre à jour l'index
    await updateTasksIndex();

    // Récupérer la tâche mise à jour
    const updatedTaskData = await redisClient.sendCommand([
      "JSON.GET",
      `tasks:${taskId}`,
    ]);
    res.json(JSON.parse(updatedTaskData));
  } catch (error) {
    console.error(
      `Erreur lors de la mise à jour de la tâche ${req.params.id}:`,
      error
    );
    res
      .status(500)
      .json({ error: "Erreur lors de la mise à jour de la tâche" });
  }
});

// Mettre à jour une tâche complète
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const taskId = req.params.id;
    const {
      title,
      description,
      status,
      priority,
      category,
      assignee,
      dueDate,
      tags,
    } = req.body;

    // Vérifier si la tâche existe
    const existingTaskData = await redisClient.sendCommand([
      "JSON.GET",
      `tasks:${taskId}`,
    ]);
    if (!existingTaskData) {
      return res.status(404).json({ error: "Tâche non trouvée" });
    }

    const existingTask = JSON.parse(existingTaskData);
    const now = new Date().toISOString();

    // Créer l'objet de tâche mis à jour
    const updatedTask = {
      ...existingTask,
      title: title || existingTask.title,
      description: description || existingTask.description,
      status: status || existingTask.status,
      priority: priority || existingTask.priority,
      category: category || existingTask.category,
      assignee: assignee || existingTask.assignee,
      dueDate: dueDate || existingTask.dueDate,
      tags: tags || existingTask.tags,
      updated_at: now,
    };

    // Si le statut change vers "Terminée" ou "Annulée", mettre à jour completed_at
    if (
      (status === "Terminée" || status === "Annulée") &&
      existingTask.status !== status
    ) {
      updatedTask.completed_at = now;
    } else if (status && status !== "Terminée" && status !== "Annulée") {
      updatedTask.completed_at = null;
    }

    // Sauvegarder la tâche mise à jour
    await redisClient.sendCommand([
      "JSON.SET",
      `tasks:${taskId}`,
      "$",
      JSON.stringify(updatedTask),
    ]);

    // Recalculer et mettre à jour l'index
    await updateTasksIndex();

    res.json(updatedTask);
  } catch (error) {
    console.error(
      `Erreur lors de la mise à jour complète de la tâche ${req.params.id}:`,
      error
    );
    res
      .status(500)
      .json({ error: "Erreur lors de la mise à jour de la tâche" });
  }
});

// Créer une nouvelle tâche
app.post("/api/tasks", async (req, res) => {
  try {
    const {
      title,
      description,
      status,
      priority,
      category,
      assignee,
      dueDate,
      tags,
      tasks,
      problem,
      objective,
    } = req.body;

    // Validation des champs obligatoires
    if (!title) {
      return res.status(400).json({ error: "Le titre est requis" });
    }

    // Générer un nouvel ID
    let newId = 1;
    try {
      const allTaskKeys = await redisClient.keys("tasks:*");
      const numericIds = allTaskKeys
        .map(key => {
          const match = key.match(/tasks:(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(id => id > 0);
      
      if (numericIds.length > 0) {
        newId = Math.max(...numericIds) + 1;
      }
    } catch (error) {
      console.error("Erreur lors de la génération de l'ID:", error);
    }

    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];

    // Créer l'objet de tâche
    const newTask = {
      id: newId,
      title: title.trim(),
      description: description?.trim() || "",
      status: status || "À faire",
      priority: priority || "Moyenne",
      category: category || "Fullstack",
      assignee: assignee?.trim() || "",
      dueDate: dueDate || today,
      tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
      tasks: Array.isArray(tasks) ? tasks : (tasks ? tasks.split('\n').filter(t => t.trim()) : []),
      problem: problem?.trim() || "",
      objective: objective?.trim() || "",
      source_file: "web-interface.mdc",
      created_at: today,
      updated_at: now,
      completed_at: null,
    };

    // Sauvegarder la nouvelle tâche
    await redisClient.sendCommand([
      "JSON.SET",
      `tasks:${newId}`,
      "$",
      JSON.stringify(newTask),
    ]);

    console.log(`Nouvelle tâche créée avec l'ID ${newId}: ${title}`);

    // Recalculer et mettre à jour l'index
    await updateTasksIndex();

    res.status(201).json(newTask);
  } catch (error) {
    console.error("Erreur lors de la création de la tâche:", error);
    res.status(500).json({ error: "Erreur lors de la création de la tâche" });
  }
});

// Supprimer une tâche
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const taskId = req.params.id;

    // Vérifier si la tâche existe
    const existingTask = await redisClient.sendCommand([
      "JSON.GET",
      `tasks:${taskId}`,
    ]);
    if (!existingTask) {
      return res.status(404).json({ error: "Tâche non trouvée" });
    }

    // Supprimer la tâche
    await redisClient.del(`tasks:${taskId}`);

    console.log(`Tâche supprimée avec l'ID ${taskId}`);

    // Recalculer et mettre à jour l'index
    await updateTasksIndex();

    res.json({ message: "Tâche supprimée avec succès", id: parseInt(taskId) });
  } catch (error) {
    console.error(`Erreur lors de la suppression de la tâche ${req.params.id}:`, error);
    res.status(500).json({ error: "Erreur lors de la suppression de la tâche" });
  }
});

// Fonction utilitaire pour mettre à jour l'index des tâches
async function updateTasksIndex() {
  try {
    // Récupérer toutes les tâches
    const taskKeys = await redisClient.keys("tasks:*");
    const tasks = [];

    for (const key of taskKeys) {
      if (key === "tasks:index") continue;

      try {
        const taskData = await redisClient.sendCommand(["JSON.GET", key]);
        if (taskData) {
          tasks.push(JSON.parse(taskData));
        }
      } catch (error) {
        console.error(
          `Erreur lors de la récupération de ${key} pour l'index:`,
          error
        );
      }
    }

    // Calculer les statistiques
    const index = {
      total_tasks: tasks.length,
      status_breakdown: {
        "À faire": 0,
        "En cours": 0,
        Terminée: 0,
        "En attente": 0,
        Annulée: 0,
      },
      priority_breakdown: {
        Haute: 0,
        Moyenne: 0,
        Basse: 0,
      },
      category_breakdown: {
        Frontend: 0,
        Backend: 0,
        Fullstack: 0,
        Testing: 0,
        OPS: 0,
      },
      task_ids: tasks.map((t) => t.id).sort((a, b) => a - b),
      last_updated: new Date().toISOString(),
    };

    // Compter les tâches par statut, priorité et catégorie
    tasks.forEach((task) => {
      if (index.status_breakdown.hasOwnProperty(task.status)) {
        index.status_breakdown[task.status]++;
      }
      if (index.priority_breakdown.hasOwnProperty(task.priority)) {
        index.priority_breakdown[task.priority]++;
      }
      if (index.category_breakdown.hasOwnProperty(task.category)) {
        index.category_breakdown[task.category]++;
      }
    });

    // Sauvegarder l'index
    await redisClient.sendCommand([
      "JSON.SET",
      "tasks:index",
      "$",
      JSON.stringify(index),
    ]);
    console.log("📊 Index des tâches mis à jour");
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'index:", error);
  }
}

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: "Route non trouvée" });
});

// Initialisation du serveur
async function startServer() {
  try {
    // Se connecter à Redis
    await redisClient.connect();

    // Démarrer le serveur Express
    app.listen(PORT, () => {
      console.log(
        `🚀 ${PROJECT_FULL_NAME} démarré sur http://localhost:${PORT}`
      );
      console.log(`📊 API disponible sur http://localhost:${PORT}/api`);
      console.log(`🌐 Interface web disponible sur http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(`❌ Erreur lors du démarrage du serveur ${PROJECT_NAME}:`, error);
    process.exit(1);
  }
}

// Gestion propre de l'arrêt
process.on("SIGINT", async () => {
  console.log(`\n🛑 Arrêt du serveur ${PROJECT_NAME}...`);
  try {
    await redisClient.quit();
    process.exit(0);
  } catch (error) {
    console.error("Erreur lors de la fermeture:", error);
    process.exit(1);
  }
});

// Démarrer le serveur
startServer();
