"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  CircleDotDashed,
  Zap,
  Loader2,
  BrainCircuit,
  Trash2,
  Plus,
  Edit2,
  Download,
  Trash,
  History,
  X,
  GripVertical,
  Compass,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup, Reorder } from "framer-motion";

// --- Types ---
interface Subtask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  timeEstimate?: string;
}
interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  level: number;
  timeEstimate?: string;
  subtasks: Subtask[];
}
interface Flashcard {
  id: string;
  front: string;
  back: string;
}
interface HistoryItem {
  id: string;
  prompt: string;
  date: string;
  tasks: Task[];
}

export default function Plan() {
  // Core State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  // UI State
  const [expandedTasks, setExpandedTasks] = useState<string[]>([]);
  const [expandedSubtasks, setExpandedSubtasks] = useState<{
    [key: string]: boolean;
  }>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Sidebar & Config State
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [numCards, setNumCards] = useState(5);

  // Flashcard (Anki) State
  const [isGeneratingCards, setIsGeneratingCards] = useState<string | null>(
    null,
  );
  const [showDeck, setShowDeck] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [cardQueue, setCardQueue] = useState<Flashcard[]>([]);
  const [deckStats, setDeckStats] = useState({ total: 0, reviews: 0 });

  // Progress Calculation
  const totalSubtasks = tasks.reduce(
    (acc, task) => acc + task.subtasks.length,
    0,
  );
  const completedSubtasks = tasks.reduce(
    (acc, task) =>
      acc + task.subtasks.filter((s) => s.status === "completed").length,
    0,
  );
  const progressPercent =
    totalSubtasks === 0
      ? 0
      : Math.round((completedSubtasks / totalSubtasks) * 100);

  // Load History on Mount
  useEffect(() => {
    const saved = localStorage.getItem("atlasHistory");
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  // Save History
  const saveToHistory = (newTasks: Task[], currentPrompt: string) => {
    const newItem = {
      id: crypto.randomUUID(),
      prompt: currentPrompt,
      date: new Date().toLocaleDateString(),
      tasks: newTasks,
    };
    const updated = [newItem, ...history].slice(0, 10);
    setHistory(updated);
    localStorage.setItem("atlasHistory", JSON.stringify(updated));
  };

  // --- AGENTIC LOGIC: GENERATE ATLAS PLAN ---
  const handleGeneratePlan = async (promptToUse: string = prompt) => {
    if (!promptToUse.trim()) return;
    setIsSyncing(true);
    setTasks([]);

    try {
      const apiKey = (import.meta as any).env.VITE_GROQ_API_KEY;
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
              {
                role: "system",
                content: `You are ATLAS, an advanced tactical planner. Output ONLY a raw JSON array. 
              CRITICAL INSTRUCTION: You MUST generate AT LEAST 4 to 6 major tasks. Do NOT generate just one task. Each task MUST contain 2 to 4 subtasks.
              Structure:[{"id": "uuid", "title": "...", "description": "...", "status": "pending", "priority": "high|medium|low", "timeEstimate": "e.g. 2h", "level": 0, "subtasks":[{"id": "uuid", "title": "...", "description": "...", "status": "pending", "priority": "high|medium|low", "timeEstimate": "e.g. 30m"}]}]`,
              },
              {
                role: "user",
                content: `Generate a comprehensive, multi-phase roadmap for: ${promptToUse}`,
              },
            ],
            temperature: 0.3, // Slightly higher to allow for more creative multi-step planning
          }),
        },
      );

      const data = await response.json();
      const jsonMatch = data.choices[0].message.content.match(/\[[\s\S]*\]/);
      const newPlan: Task[] = JSON.parse(jsonMatch[0]);

      setTasks(newPlan);
      // Auto-expand the first two tasks so the user sees the generated data immediately
      if (newPlan.length > 0)
        setExpandedTasks(newPlan.slice(0, 2).map((t) => t.id));
      saveToHistory(newPlan, promptToUse);
      setPrompt("");
    } catch (error) {
      console.error("ATLAS Gen Error:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- AGENTIC LOGIC: GENERATE FLASHCARDS ---
  const handleGenerateFlashcards = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGeneratingCards(task.id);
    try {
      const apiKey = (import.meta as any).env.VITE_GROQ_API_KEY;
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
              {
                role: "system",
                content: `Output ONLY a raw JSON array of objects:[{"id": "uuid", "front": "Question...", "back": "Answer..."}]`,
              },
              {
                role: "user",
                content: `Create ${numCards} spaced-repetition flashcards for topic: ${task.title}. Context: ${task.description}`,
              },
            ],
            temperature: 0.3,
          }),
        },
      );

      const data = await response.json();
      const jsonMatch = data.choices[0].message.content.match(/\[[\s\S]*\]/);
      const newCards: Flashcard[] = JSON.parse(jsonMatch[0]);

      setCardQueue(newCards);
      setDeckStats({ total: newCards.length, reviews: 0 });
      setIsFlipped(false);
      setShowDeck(true);
    } catch (error) {
      console.error("Flashcard Gen Error:", error);
    } finally {
      setIsGeneratingCards(null);
    }
  };

  // --- FLASHCARD SRS LOGIC ---
  const handleScoreCard = (
    action: "again" | "hard" | "good" | "easy" | "skip",
  ) => {
    if (cardQueue.length === 0) return;

    // Smoothly flip back to front before changing the card
    setIsFlipped(false);

    setTimeout(() => {
      const currentCard = cardQueue[0];
      const newQueue = [...cardQueue.slice(1)];

      setDeckStats((s) => ({ ...s, reviews: s.reviews + 1 }));

      if (action === "again") {
        newQueue.splice(Math.min(1, newQueue.length), 0, currentCard);
      } else if (action === "hard" || action === "skip") {
        newQueue.push(currentCard);
      }
      // Good or Easy drops the card entirely

      setCardQueue(newQueue);
    }, 200); // Wait 200ms for the card to physically turn around before changing text
  };

  // Keyboard Shortcuts for Flashcards
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showDeck || cardQueue.length === 0) return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      }
      if (isFlipped) {
        if (e.key === "1") handleScoreCard("again");
        if (e.key === "2") handleScoreCard("hard");
        if (e.key === "3") handleScoreCard("good");
        if (e.key === "4") handleScoreCard("easy");
        if (e.key === "s" || e.key === "S") handleScoreCard("skip");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDeck, isFlipped, cardQueue]);

  // --- CRUD & UI ACTIONS ---
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ATLAS_Plan_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  };

  const addTask = () =>
    setTasks([
      ...tasks,
      {
        id: crypto.randomUUID(),
        title: "New Atlas Node",
        description: "Edit description...",
        status: "pending",
        priority: "medium",
        level: 0,
        subtasks: [],
      },
    ]);
  const addSubtask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTasks((p) =>
      p.map((t) =>
        t.id === taskId
          ? {
              ...t,
              subtasks: [
                ...t.subtasks,
                {
                  id: crypto.randomUUID(),
                  title: "New Subtask",
                  description: "",
                  status: "pending",
                  priority: "medium",
                },
              ],
            }
          : t,
      ),
    );
    if (!expandedTasks.includes(taskId))
      setExpandedTasks([...expandedTasks, taskId]);
  };

  const deleteTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTasks((p) => p.filter((t) => t.id !== taskId));
  };
  const deleteSubtask = (
    taskId: string,
    subtaskId: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setTasks((p) =>
      p.map((t) =>
        t.id === taskId
          ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) }
          : t,
      ),
    );
  };

  const saveEdit = (id: string, isSubtask: boolean, parentId?: string) => {
    if (isSubtask && parentId) {
      setTasks((p) =>
        p.map((t) =>
          t.id === parentId
            ? {
                ...t,
                subtasks: t.subtasks.map((s) =>
                  s.id === id ? { ...s, title: editValue } : s,
                ),
              }
            : t,
        ),
      );
    } else
      setTasks((p) =>
        p.map((t) => (t.id === id ? { ...t, title: editValue } : t)),
      );
    setEditingId(null);
  };

  const toggleTaskStatus = (taskId: string) =>
    setTasks((p) =>
      p.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: t.status === "completed" ? "pending" : "completed",
              subtasks: t.subtasks.map((s) => ({
                ...s,
                status: t.status === "completed" ? "pending" : "completed",
              })),
            }
          : t,
      ),
    );
  const toggleSubtaskStatus = (taskId: string, subtaskId: string) =>
    setTasks((p) =>
      p.map((t) => {
        if (t.id === taskId) {
          const updated = t.subtasks.map((s) =>
            s.id === subtaskId
              ? {
                  ...s,
                  status: s.status === "completed" ? "pending" : "completed",
                }
              : s,
          );
          return {
            ...t,
            subtasks: updated,
            status: updated.every((s) => s.status === "completed")
              ? "completed"
              : t.status,
          };
        }
        return t;
      }),
    );

  const getPriorityColor = (p: string) =>
    p.toLowerCase() === "high"
      ? "bg-[#F72585] shadow-[0_0_10px_#F72585]"
      : p.toLowerCase() === "medium"
        ? "bg-[#B5179E]"
        : "bg-[#7209B7]";

  return (
    <div className="flex h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-[#B5179E]/40 overflow-hidden relative">
      {/* --- SIDEBAR: HISTORY --- */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full border-r border-[#3A0CA3]/30 bg-[#0a0a0c] flex flex-col z-20 whitespace-nowrap overflow-hidden hidden md:flex"
          >
            <div className="p-4 border-b border-[#3A0CA3]/30 flex justify-between items-center text-[#F72585] font-black tracking-widest uppercase">
              <span>Atlas Logs</span>
              <X
                className="cursor-pointer hover:text-white"
                size={18}
                onClick={() => setShowHistory(false)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setTasks(item.tasks)}
                  className="p-3 bg-white/5 hover:bg-[#3A0CA3]/20 rounded-lg cursor-pointer border border-transparent hover:border-[#560BAD]/50 transition-all"
                >
                  <div className="text-xs text-zinc-400 mb-1">{item.date}</div>
                  <div className="text-sm text-zinc-100 truncate">
                    {item.prompt}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* TOP BAR & PROGRESS */}
        <div className="px-6 py-4 border-b border-[#3A0CA3]/30 bg-[#0a0a0c]/80 backdrop-blur-md flex flex-wrap gap-4 justify-between items-center z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-[#560BAD] hover:text-[#B5179E] transition-colors"
            >
              <History size={20} />
            </button>
            {/* BRANDING UPDATE: ATLAS WITH COMPASS ICON */}
            <h1 className="text-xl font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-[#560BAD] via-[#B5179E] to-[#F72585] flex items-center gap-2 uppercase">
              <Compass className="text-[#F72585]" size={24} strokeWidth={2.5} />{" "}
              ATLAS
            </h1>
          </div>

          {tasks.length > 0 && (
            <div className="flex-1 max-w-md mx-4">
              <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500 mb-1">
                <span>Mission Progress</span>
                <span className="text-[#F72585]">{progressPercent}%</span>
              </div>
              <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  className="h-full bg-gradient-to-r from-[#7209B7] to-[#F72585] shadow-[0_0_10px_#F72585]"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="p-2 text-zinc-500 hover:text-[#F72585] transition-colors"
              title="Export ATLAS JSON"
            >
              <Download size={18} />
            </button>
            <button
              onClick={() => {
                setTasks([]);
                setPrompt("");
              }}
              className="p-2 text-zinc-500 hover:text-red-500 transition-colors"
              title="Clear Grid"
            >
              <Trash size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32">
          {/* INPUT BAR AREA */}
          <div className="max-w-4xl mx-auto mb-10">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleGeneratePlan();
              }}
              className="relative shadow-[0_0_40px_rgba(86,11,173,0.1)] group"
            >
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isSyncing}
                placeholder="Define ATLAS target trajectory..."
                className="w-full bg-[#0a0a0c]/80 border border-[#3A0CA3]/50 rounded-2xl pl-6 pr-[140px] py-5 text-sm text-zinc-100 focus:outline-none focus:border-[#F72585] focus:ring-1 focus:ring-[#F72585] transition-all placeholder:text-zinc-600 backdrop-blur-xl"
              />
              <div className="absolute right-3 top-3 bottom-3 flex gap-2">
                <select
                  value={numCards}
                  onChange={(e) => setNumCards(Number(e.target.value))}
                  className="bg-[#3A0CA3]/20 border border-[#3A0CA3]/50 text-xs text-[#B5179E] rounded-lg px-2 outline-none hidden sm:block"
                >
                  <option value={3}>3 Cards</option>
                  <option value={5}>5 Cards</option>
                  <option value={10}>10 Cards</option>
                </select>
                <button
                  type="submit"
                  disabled={isSyncing || !prompt}
                  className="px-6 bg-gradient-to-r from-[#7209B7] to-[#B5179E] hover:to-[#F72585] text-white text-xs font-black tracking-widest rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSyncing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Zap size={16} />
                  )}{" "}
                  SYNC
                </button>
              </div>
            </form>

            {/* Example Prompts */}
            {tasks.length === 0 && !isSyncing && (
              <div className="flex flex-wrap gap-2 justify-center mt-6">
                {[
                  "Master AWS Cloud Practitioner",
                  "Build a Startup MVP",
                  "Learn Data Structures in C++",
                  "Outline a Novel",
                ].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => handleGeneratePlan(ex)}
                    className="text-[10px] px-3 py-1.5 rounded-full border border-zinc-800 text-zinc-500 hover:text-[#B5179E] hover:border-[#B5179E]/50 transition-all uppercase tracking-wider"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* EMPTY STATE */}
          {tasks.length === 0 && !isSyncing && (
            <div className="text-center py-20 opacity-30">
              <Compass
                size={80}
                className="mx-auto mb-4 text-[#560BAD] opacity-50"
              />
              <h2 className="text-2xl font-black text-white tracking-[0.2em] uppercase">
                Atlas Offline
              </h2>
              <p className="text-sm tracking-wider mt-2">
                Awaiting coordinates to render strategic roadmap.
              </p>
            </div>
          )}

          {/* TASK LIST (DRAG & DROP) */}
          <div className="max-w-4xl mx-auto">
            <LayoutGroup>
              <Reorder.Group
                axis="y"
                values={tasks}
                onReorder={setTasks}
                className="space-y-4"
              >
                {tasks.map((task) => {
                  const isExpanded = expandedTasks.includes(task.id);
                  const isCompleted = task.status === "completed";
                  const groupCompleteGlow = isCompleted
                    ? "shadow-[0_0_20px_rgba(34,197,94,0.15)] border-green-500/30"
                    : "border-zinc-800/50";

                  return (
                    <Reorder.Item
                      key={task.id}
                      value={task}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <div
                        className={`bg-[#0a0a0c] border rounded-2xl overflow-hidden transition-all duration-500 ${groupCompleteGlow}`}
                      >
                        <div className="group flex items-center px-4 py-4 hover:bg-white/[0.02] transition-colors relative">
                          <div className="mr-2 cursor-grab text-zinc-700 hover:text-[#B5179E] hidden sm:block">
                            <GripVertical size={16} />
                          </div>
                          <div
                            className={`w-2 h-2 rounded-full mr-3 ${getPriorityColor(task.priority)}`}
                          />

                          <div
                            className="mr-3 flex-shrink-0 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTaskStatus(task.id);
                            }}
                          >
                            <AnimatePresence mode="wait">
                              {task.status === "completed" ? (
                                <CheckCircle2 className="h-6 w-6 text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                              ) : task.status === "in-progress" ? (
                                <CircleDotDashed className="h-6 w-6 text-[#F72585] animate-spin-slow drop-shadow-[0_0_8px_rgba(247,37,133,0.5)]" />
                              ) : (
                                <Circle className="text-zinc-700 h-6 w-6 hover:text-[#560BAD]" />
                              )}
                            </AnimatePresence>
                          </div>

                          <div
                            className="flex flex-grow items-center justify-between cursor-pointer"
                            onClick={() =>
                              setExpandedTasks((p) =>
                                p.includes(task.id)
                                  ? p.filter((id) => id !== task.id)
                                  : [...p, task.id],
                              )
                            }
                          >
                            <div className="flex-1 truncate pr-4">
                              {editingId === task.id ? (
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => saveEdit(task.id, false)}
                                  onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    saveEdit(task.id, false)
                                  }
                                  className="bg-transparent border-b border-[#F72585] text-white outline-none w-full"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span
                                  className={`font-semibold tracking-tight text-base sm:text-lg ${isCompleted ? "text-zinc-600 line-through" : "text-zinc-100"}`}
                                >
                                  {task.title}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
                              {task.timeEstimate && (
                                <span className="text-zinc-600 font-mono text-[10px] hidden sm:block">
                                  {task.timeEstimate}
                                </span>
                              )}

                              <button
                                onClick={(e) =>
                                  handleGenerateFlashcards(task, e)
                                }
                                className="group/btn relative flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-[#560BAD]/20 text-zinc-500 hover:text-[#B5179E] border border-zinc-800 hover:border-[#560BAD] rounded-lg transition-all"
                                title="Generate Spaced Repetition Flashcards"
                              >
                                {isGeneratingCards === task.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <BrainCircuit size={12} />
                                )}
                                <span className="font-black text-[10px] uppercase tracking-widest hidden sm:block">
                                  Deck
                                </span>
                              </button>

                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditValue(task.title);
                                    setEditingId(task.id);
                                  }}
                                  className="p-1 hover:text-[#F72585]"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={(e) => addSubtask(task.id, e)}
                                  className="p-1 hover:text-[#B5179E]"
                                >
                                  <Plus size={16} />
                                </button>
                                <button
                                  onClick={(e) => deleteTask(task.id, e)}
                                  className="p-1 hover:text-red-500"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* SUBTASKS */}
                        <AnimatePresence>
                          {isExpanded && task.subtasks.length > 0 && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="bg-black/40 border-t border-zinc-800/50"
                            >
                              <ul className="py-2 px-4 sm:pl-16 space-y-1">
                                {task.subtasks.map((subtask) => (
                                  <li
                                    key={subtask.id}
                                    className="group flex flex-col py-1.5"
                                  >
                                    <div className="flex items-center rounded-lg p-2 hover:bg-white/[0.03]">
                                      <div
                                        className={`w-1.5 h-1.5 rounded-full mr-3 opacity-50 ${getPriorityColor(subtask.priority)}`}
                                      />
                                      <div
                                        className="mr-3 cursor-pointer"
                                        onClick={() =>
                                          toggleSubtaskStatus(
                                            task.id,
                                            subtask.id,
                                          )
                                        }
                                      >
                                        {subtask.status === "completed" ? (
                                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <Circle className="text-zinc-700 h-4 w-4 hover:text-[#B5179E]" />
                                        )}
                                      </div>

                                      <div className="flex-1 flex justify-between items-center pr-2">
                                        {editingId === subtask.id ? (
                                          <input
                                            autoFocus
                                            value={editValue}
                                            onChange={(e) =>
                                              setEditValue(e.target.value)
                                            }
                                            onBlur={() =>
                                              saveEdit(
                                                subtask.id,
                                                true,
                                                task.id,
                                              )
                                            }
                                            onKeyDown={(e) =>
                                              e.key === "Enter" &&
                                              saveEdit(
                                                subtask.id,
                                                true,
                                                task.id,
                                              )
                                            }
                                            className="bg-transparent border-b border-[#F72585] text-white text-sm outline-none w-full"
                                          />
                                        ) : (
                                          <span
                                            className={`text-sm ${subtask.status === "completed" ? "text-zinc-600 line-through" : "text-zinc-300"}`}
                                          >
                                            {subtask.title}
                                          </span>
                                        )}

                                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2">
                                          {subtask.timeEstimate && (
                                            <span className="text-zinc-600 text-[10px] font-mono">
                                              {subtask.timeEstimate}
                                            </span>
                                          )}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditValue(subtask.title);
                                              setEditingId(subtask.id);
                                            }}
                                            className="hover:text-[#F72585] text-zinc-600"
                                          >
                                            <Edit2 size={12} />
                                          </button>
                                          <button
                                            onClick={(e) =>
                                              deleteSubtask(
                                                task.id,
                                                subtask.id,
                                                e,
                                              )
                                            }
                                            className="hover:text-red-500 text-zinc-600"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </LayoutGroup>
          </div>
        </div>
      </div>

      {/* --- FLASHCARD SRS OVERLAY (TRUE 3D FLIP) --- */}
      <AnimatePresence>
        {showDeck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/95 backdrop-blur-md p-4"
          >
            <div className="w-full max-w-2xl relative">
              <button
                onClick={() => setShowDeck(false)}
                className="absolute -top-12 right-0 text-zinc-500 hover:text-white"
              >
                <X size={24} />
              </button>

              {cardQueue.length > 0 ? (
                <>
                  <div className="flex justify-between items-center text-[10px] font-black tracking-widest uppercase mb-4 text-[#F72585]">
                    <span>Neural Retention Protocol</span>
                    <span>Cards Remaining: {cardQueue.length}</span>
                  </div>

                  {/* 3D PERSPECTIVE CONTAINER */}
                  <div
                    className="relative w-full h-[350px] sm:h-[450px]"
                    style={{ perspective: "1500px" }}
                  >
                    <motion.div
                      className="w-full h-full relative"
                      initial={false}
                      animate={{ rotateY: isFlipped ? 180 : 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 150,
                        damping: 20,
                      }}
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      {/* FRONT FACE (Question) */}
                      <div
                        onClick={() => !isFlipped && setIsFlipped(true)}
                        className="absolute inset-0 w-full h-full bg-[#0a0a0c] border border-[#3A0CA3] shadow-[0_0_50px_rgba(86,11,173,0.2)] rounded-3xl p-8 sm:p-12 flex flex-col justify-center items-center text-center cursor-pointer"
                        style={{ backfaceVisibility: "hidden" }}
                      >
                        <div className="text-xl sm:text-3xl font-medium text-white leading-tight">
                          {cardQueue[0].front}
                        </div>
                        <div className="absolute bottom-6 left-0 right-0 text-[10px] text-[#560BAD] uppercase flex justify-center items-center gap-2 font-black tracking-widest">
                          <span className="bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                            SPACE
                          </span>{" "}
                          to flip
                        </div>
                      </div>

                      {/* BACK FACE (Answer) - Rotated 180 deg initially */}
                      <div
                        className="absolute inset-0 w-full h-full bg-[#0a0a0c] border border-[#F72585]/50 shadow-[0_0_50px_rgba(247,37,133,0.2)] rounded-3xl p-8 sm:p-12 flex flex-col overflow-hidden"
                        style={{
                          backfaceVisibility: "hidden",
                          transform: "rotateY(180deg)",
                        }}
                      >
                        <div className="text-sm text-[#B5179E] mb-6 pb-6 border-b border-[#3A0CA3]/50 font-medium text-center">
                          {cardQueue[0].front}
                        </div>
                        <div className="text-lg sm:text-2xl text-zinc-100 leading-relaxed font-medium flex-1 overflow-y-auto custom-scrollbar flex items-center justify-center text-center">
                          {cardQueue[0].back}
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* SRS Action Buttons */}
                  <div className="h-20 mt-6 relative">
                    <AnimatePresence>
                      {isFlipped && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="flex flex-wrap sm:flex-nowrap justify-between gap-2 absolute inset-0"
                        >
                          {[
                            {
                              label: "AGAIN",
                              key: "1",
                              action: "again" as const,
                              color:
                                "hover:bg-red-500/20 hover:text-red-400 border-red-900/50",
                            },
                            {
                              label: "HARD",
                              key: "2",
                              action: "hard" as const,
                              color:
                                "hover:bg-orange-500/20 hover:text-orange-400 border-orange-900/50",
                            },
                            {
                              label: "GOOD",
                              key: "3",
                              action: "good" as const,
                              color:
                                "hover:bg-[#B5179E]/20 hover:text-[#B5179E] border-[#B5179E]/50",
                            },
                            {
                              label: "EASY",
                              key: "4",
                              action: "easy" as const,
                              color:
                                "hover:bg-[#F72585]/20 hover:text-[#F72585] border-[#F72585]/50",
                            },
                          ].map((btn) => (
                            <button
                              key={btn.label}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleScoreCard(btn.action);
                              }}
                              className={`flex-1 py-4 bg-[#0a0a0c] border ${btn.color} rounded-2xl text-[10px] sm:text-xs font-black tracking-widest text-zinc-500 transition-all flex flex-col items-center gap-1`}
                            >
                              <span className="text-[9px] bg-black/50 px-1.5 rounded">
                                {btn.key}
                              </span>
                              {btn.label}
                            </button>
                          ))}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScoreCard("skip");
                            }}
                            className="flex-1 py-4 bg-[#0a0a0c] border hover:bg-zinc-800/50 border-zinc-800 rounded-2xl text-[10px] sm:text-xs font-black tracking-widest text-zinc-500 transition-all flex flex-col items-center gap-1"
                          >
                            <span className="text-[9px] bg-black/50 px-1.5 rounded">
                              S
                            </span>
                            SKIP
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                /* SUMMARY SCREEN */
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-[#0a0a0c] border border-[#F72585]/50 shadow-[0_0_50px_rgba(247,37,133,0.2)] rounded-3xl p-12 text-center relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#3A0CA3] via-[#B5179E] to-[#F72585]" />
                  <CheckCircle2
                    size={64}
                    className="mx-auto text-[#F72585] mb-6 drop-shadow-[0_0_15px_rgba(247,37,133,0.5)]"
                  />
                  <h2 className="text-3xl font-black text-white mb-2 tracking-[0.2em] uppercase">
                    Deck Conquered
                  </h2>
                  <p className="text-zinc-400 mb-8">
                    Atlas Neural Pathways Reinforced.
                  </p>

                  <div className="flex justify-center gap-8 mb-10">
                    <div className="text-center">
                      <div className="text-4xl font-black text-[#560BAD]">
                        {deckStats.total}
                      </div>
                      <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mt-1">
                        Mastered
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-4xl font-black text-[#B5179E]">
                        {deckStats.reviews}
                      </div>
                      <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mt-1">
                        Total Flips
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowDeck(false)}
                    className="px-8 py-4 bg-gradient-to-r from-[#7209B7] to-[#F72585] hover:to-white hover:text-black text-white font-black uppercase tracking-widest rounded-xl transition-all"
                  >
                    Return to Atlas Grid
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
