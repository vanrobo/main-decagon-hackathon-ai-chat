"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
  Zap,
  Loader2,
  BrainCircuit,
  X,
  Compass,
  Paperclip,
  PlusIcon,
  ArrowUpIcon,
  ImageIcon,
  Figma,
  FileUp,
  MonitorIcon,
  CircleUserRound,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

// --- Utility function replacing "@/lib/utils" ---
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

// --- Types ---
interface Subtask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  tools?: string[];
}
interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  level: number;
  dependencies: string[];
  subtasks: Subtask[];
}
interface Flashcard {
  id: string;
  front: string;
  back: string;
}

// --- Hook: Auto-resize Textarea ---
function useAutoResizeTextarea(minHeight: number, maxHeight: number) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = `${minHeight}px`;
      if (reset) return;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight),
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight],
  );
  return { textareaRef, adjustHeight };
}

export default function Plan() {
  // Core State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [thinkPhase, setThinkPhase] = useState<number>(0);
  const [agentError, setAgentError] = useState<string | null>(null);

  // Flashcards
  const [showDeck, setShowDeck] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [cardQueue, setCardQueue] = useState<Flashcard[]>([]);
  const [activeTaskTitle, setActiveTaskTitle] = useState("");

  // UI State
  const [expandedTasks, setExpandedTasks] = useState<string[]>([]);
  const [expandedSubtasks, setExpandedSubtasks] = useState<{
    [key: string]: boolean;
  }>({});
  const { textareaRef, adjustHeight } = useAutoResizeTextarea(60, 200);

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // --- AGENTIC SYNC FLOW ---
  const handleAtlasSync = async (overridePrompt?: string) => {
    const finalPrompt = overridePrompt || prompt;
    if (!finalPrompt.trim() || isSyncing) return;

    setIsSyncing(true);
    setTasks([]);
    setShowDeck(false);
    setAgentError(null);

    // 1. UI Feedback: Faking the steps you requested
    setThinkPhase(1); // Searching Project Requirements
    await new Promise((r) => setTimeout(r, 1200));
    setThinkPhase(2); // Planning Course Structure

    try {
      const apiKey = (import.meta as any).env.VITE_GROQ_API_KEY;
      if (!apiKey) throw new Error("Missing API Key in .env file.");

      // Fetch Roadmap
      const roadmapResponse = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "system",
                content:
                  "Output ONLY a raw JSON array of 4 tasks. Structure:[{id, title, description, status:'pending', priority:'high', level:0, dependencies:[], subtasks:[{id, title, description, status:'pending', priority:'high', tools:[]}]}]",
              },
              {
                role: "user",
                content: `Create detailed study roadmap for: ${finalPrompt}`,
              },
            ],
            temperature: 0.2,
          }),
        },
      );

      const roadmapData = await roadmapResponse.json();
      if (roadmapData.error) throw new Error(roadmapData.error.message);

      // CRASH PREVENTION: Safely parse the JSON
      const content = roadmapData.choices[0].message.content;
      const rmMatch = content.match(/\[[\s\S]*?\]/);
      if (!rmMatch)
        throw new Error("AI failed to generate a valid data structure.");

      const newPlan: Task[] = JSON.parse(rmMatch[0]);
      setTasks(newPlan);
      setExpandedTasks([newPlan[0].id]); // Auto expand first task

      // Fetch Flashcards automatically for the first task
      setThinkPhase(3); // Generating Flashcards
      setActiveTaskTitle(newPlan[0].title);

      const fcResponse = await fetch(
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
                content:
                  "Output ONLY a raw JSON array of 5 flashcards: [{id, front, back}]",
              },
              {
                role: "user",
                content: `Create flashcards for: ${newPlan[0].title}`,
              },
            ],
            temperature: 0.3,
          }),
        },
      );

      const fcData = await fcResponse.json();
      const fcMatch = fcData.choices[0].message.content.match(/\[[\s\S]*\]/);
      if (fcMatch) {
        setCardQueue(JSON.parse(fcMatch[0]));
        setShowDeck(true); // Slide deck in on the right
      }
    } catch (error: any) {
      console.error("Atlas Crash Prevented:", error);
      setAgentError(error.message || "Neural link failed. Please try again.");
    } finally {
      setIsSyncing(false);
      setThinkPhase(0);
      setPrompt("");
      adjustHeight(true);
    }
  };

  const handleScoreCard = (action: string) => {
    setIsFlipped(false);
    setTimeout(() => {
      const newQueue = [...cardQueue.slice(1)];
      if (action === "again" || action === "hard") newQueue.push(cardQueue[0]);
      setCardQueue(newQueue);
      if (newQueue.length === 0) setShowDeck(false);
    }, 200);
  };

  // UI Toggles (Original Architecture)
  const toggleTaskExpansion = (id: string) =>
    setExpandedTasks((p) =>
      p.includes(id) ? p.filter((i) => i !== id) : [...p, id],
    );
  const toggleSubtaskExpansion = (tid: string, sid: string) =>
    setExpandedSubtasks((p) => ({
      ...p,
      [`${tid}-${sid}`]: !p[`${tid}-${sid}`],
    }));
  const toggleTaskStatus = (id: string) =>
    setTasks((p) =>
      p.map((t) =>
        t.id === id
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
  const toggleSubtaskStatus = (tid: string, sid: string) =>
    setTasks((p) =>
      p.map((t) => {
        if (t.id === tid) {
          const u = t.subtasks.map((s) =>
            s.id === sid
              ? {
                  ...s,
                  status: s.status === "completed" ? "pending" : "completed",
                }
              : s,
          );
          return {
            ...t,
            subtasks: u,
            status: u.every((s) => s.status === "completed")
              ? "completed"
              : t.status,
          };
        }
        return t;
      }),
    );

  // Animation Variants
  const taskVariants = {
    hidden: { opacity: 0, y: -5 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 500, damping: 30 },
    },
  };
  const subtaskListVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: { height: "auto", opacity: 1, transition: { duration: 0.25 } },
  };

  const hasStarted = tasks.length > 0 || isSyncing;

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-[#F72585]/30 overflow-hidden">
      {/* HEADER */}
      <header className="px-6 py-4 flex items-center gap-3 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-[#560BAD]/10 to-[#F72585]/10 border border-white/10">
          <Compass
            className="text-[#F72585] drop-shadow-lg"
            size={28}
            strokeWidth={2.5}
          />
          <span className="text-xl font-black tracking-[0.2em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#560BAD] to-[#F72585]">
            Atlas
          </span>
        </div>
      </header>

      {/* MAIN LAYOUT (Split Screen) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* CENTER: CHAT OR ROADMAP */}
        <main
          className={cn(
            "flex-1 flex flex-col transition-all duration-500",
            showDeck ? "mr-[400px]" : "mr-0",
          )}
        >
          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div
              className={cn(
                "w-full max-w-4xl mx-auto transition-all duration-500",
                !hasStarted ? "mt-[10vh]" : "mt-0",
              )}
            >
              {/* THE V0 HERO STATE */}
              {!hasStarted && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center w-full mb-12"
                >
                  <h1 className="text-3xl md:text-5xl font-bold text-white mb-8 tracking-tight">
                    What can I help you map?
                  </h1>
                </motion.div>
              )}

              {/* V0 INPUT COMPONENT (Moves to bottom when active) */}
              <motion.div
                layout
                className={cn(
                  "w-full transition-all duration-700",
                  hasStarted
                    ? "fixed bottom-6 left-1/2 -translate-x-1/2 max-w-3xl z-50 px-4"
                    : "",
                )}
              >
                <div className="bg-[#111113] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                  <div className="overflow-y-auto custom-scrollbar">
                    <textarea
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value);
                        adjustHeight();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAtlasSync();
                        }
                      }}
                      placeholder="Ask Atlas to generate a learning trajectory..."
                      disabled={isSyncing}
                      className="w-full px-5 py-4 resize-none bg-transparent border-none text-white text-sm focus:outline-none placeholder:text-zinc-500 min-h-[60px]"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 border-t border-white/5 bg-[#111113]">
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white flex items-center gap-1">
                        <Paperclip size={16} />{" "}
                        <span className="text-xs hidden sm:block">Attach</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 transition-colors border border-dashed border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 flex items-center gap-2">
                        <PlusIcon size={14} /> Project
                      </button>
                      <button
                        onClick={() => handleAtlasSync()}
                        disabled={!prompt.trim() || isSyncing}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          prompt.trim()
                            ? "bg-white text-black hover:bg-zinc-200"
                            : "bg-zinc-800 text-zinc-500",
                        )}
                      >
                        {isSyncing ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <ArrowUpIcon size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* V0 Action Pills (Only visible initially) */}
                {!hasStarted && (
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                    <ActionButton
                      icon={<ImageIcon size={14} />}
                      label="Analyze Syllabus"
                      onClick={() => setPrompt("Analyze Syllabus")}
                    />
                    <ActionButton
                      icon={<MonitorIcon size={14} />}
                      label="Learn React Basics"
                      onClick={() => setPrompt("Learn React Basics")}
                    />
                    <ActionButton
                      icon={<CircleUserRound size={14} />}
                      label="Prepare for Interview"
                      onClick={() => setPrompt("Prepare for Interview")}
                    />
                  </div>
                )}
              </motion.div>

              {/* AGENTIC LOADING SEQUENCE */}
              <AnimatePresence>
                {isSyncing && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-20"
                  >
                    <div className="flex items-center gap-8 text-zinc-500 text-xs font-bold uppercase tracking-widest">
                      <div
                        className={cn(
                          "flex items-center gap-2 transition-colors duration-500",
                          thinkPhase >= 1 ? "text-[#F72585]" : "",
                        )}
                      >
                        {thinkPhase === 1 ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}{" "}
                        Searching Requirements
                      </div>
                      <div
                        className={cn(
                          "flex items-center gap-2 transition-colors duration-500",
                          thinkPhase >= 2 ? "text-[#B5179E]" : "opacity-30",
                        )}
                      >
                        {thinkPhase === 2 ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Circle size={14} />
                        )}{" "}
                        Planning Structure
                      </div>
                      <div
                        className={cn(
                          "flex items-center gap-2 transition-colors duration-500",
                          thinkPhase >= 3 ? "text-[#7209B7]" : "opacity-30",
                        )}
                      >
                        {thinkPhase === 3 ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Circle size={14} />
                        )}{" "}
                        Generating Cards
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ERROR MESSAGE */}
              {agentError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl mb-8 text-sm text-center">
                  {agentError}
                </div>
              )}

              {/* ORIGINAL PLANNING ARCHITECTURE (Restored Look) */}
              {tasks.length > 0 && !isSyncing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="pb-40"
                >
                  <LayoutGroup>
                    <div className="p-4 overflow-hidden">
                      <ul className="space-y-2 overflow-hidden">
                        {tasks.map((task, index) => {
                          const isExpanded = expandedTasks.includes(task.id);
                          const isCompleted = task.status === "completed";

                          return (
                            <motion.li
                              key={task.id}
                              className={cn(index !== 0 ? "mt-2 pt-2" : "")}
                              initial="hidden"
                              animate="visible"
                              variants={taskVariants}
                            >
                              {/* Task Row (Original Look) */}
                              <motion.div className="group flex items-center px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer border border-transparent hover:border-white/5">
                                <motion.div
                                  className="mr-3 flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTaskStatus(task.id);
                                  }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  {isCompleted ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                                  ) : task.status === "in-progress" ? (
                                    <CircleDotDashed className="h-5 w-5 text-[#F72585] animate-spin-slow" />
                                  ) : (
                                    <Circle className="text-zinc-600 h-5 w-5 hover:text-[#560BAD]" />
                                  )}
                                </motion.div>

                                <motion.div
                                  className="flex min-w-0 flex-grow items-center justify-between"
                                  onClick={() => toggleTaskExpansion(task.id)}
                                >
                                  <div className="mr-2 flex-1 truncate">
                                    <span
                                      className={cn(
                                        "text-base font-medium",
                                        isCompleted
                                          ? "text-zinc-600 line-through"
                                          : "text-zinc-200",
                                      )}
                                    >
                                      {task.title}
                                    </span>
                                  </div>

                                  <div className="flex flex-shrink-0 items-center space-x-3 text-xs">
                                    {/* Dependencies (Original Look) */}
                                    {task.dependencies &&
                                      task.dependencies.length > 0 && (
                                        <div className="hidden sm:flex items-center gap-1">
                                          {task.dependencies.map((dep, idx) => (
                                            <span
                                              key={idx}
                                              className="bg-zinc-900 text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5 text-[10px] font-bold"
                                            >
                                              {dep}
                                            </span>
                                          ))}
                                        </div>
                                      )}

                                    {/* Agentic Trigger: Open Deck */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveTaskTitle(task.title);
                                        setShowDeck(true);
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3A0CA3]/20 hover:bg-[#3A0CA3]/40 text-[#B5179E] border border-[#3A0CA3]/50 rounded-lg transition-all"
                                    >
                                      <BrainCircuit size={14} />{" "}
                                      <span className="font-bold text-[10px] uppercase tracking-wider hidden sm:block">
                                        Launch Deck
                                      </span>
                                    </button>

                                    {/* Status Badge */}
                                    <span
                                      className={cn(
                                        "rounded px-2 py-1 font-bold text-[10px] uppercase tracking-wider",
                                        isCompleted
                                          ? "bg-emerald-500/10 text-emerald-500"
                                          : task.status === "in-progress"
                                            ? "bg-[#F72585]/10 text-[#F72585]"
                                            : "bg-zinc-900 text-zinc-500",
                                      )}
                                    >
                                      {task.status}
                                    </span>
                                  </div>
                                </motion.div>
                              </motion.div>

                              {/* Subtasks (Original Dashed Line Architecture) */}
                              <AnimatePresence mode="wait">
                                {isExpanded && task.subtasks.length > 0 && (
                                  <motion.div
                                    className="relative overflow-hidden pl-2"
                                    variants={subtaskListVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="hidden"
                                    layout
                                  >
                                    {/* The connecting dashed line */}
                                    <div className="absolute top-0 bottom-0 left-[22px] border-l-2 border-dashed border-zinc-800" />

                                    <ul className="mt-2 mr-2 mb-2 ml-5 space-y-1">
                                      {task.subtasks.map((subtask) => {
                                        const subtaskKey = `${task.id}-${subtask.id}`;
                                        const isSubtaskExpanded =
                                          expandedSubtasks[subtaskKey];

                                        return (
                                          <motion.li
                                            key={subtask.id}
                                            className="group flex flex-col py-1 pl-6"
                                            layout
                                          >
                                            <div
                                              className="flex flex-1 items-center rounded-lg p-1.5 hover:bg-white/[0.02] cursor-pointer"
                                              onClick={() =>
                                                toggleSubtaskExpansion(
                                                  task.id,
                                                  subtask.id,
                                                )
                                              }
                                            >
                                              <div
                                                className="mr-3 flex-shrink-0"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleSubtaskStatus(
                                                    task.id,
                                                    subtask.id,
                                                  );
                                                }}
                                              >
                                                {subtask.status ===
                                                "completed" ? (
                                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                ) : (
                                                  <Circle className="text-zinc-600 h-4 w-4" />
                                                )}
                                              </div>
                                              <span
                                                className={cn(
                                                  "text-sm flex-1",
                                                  subtask.status === "completed"
                                                    ? "text-zinc-600 line-through"
                                                    : "text-zinc-300",
                                                )}
                                              >
                                                {subtask.title}
                                              </span>
                                            </div>

                                            <AnimatePresence mode="wait">
                                              {isSubtaskExpanded && (
                                                <motion.div
                                                  className="text-zinc-500 border-l-2 border-dashed border-zinc-800 mt-2 ml-2 pl-5 text-sm overflow-hidden"
                                                  initial={{
                                                    height: 0,
                                                    opacity: 0,
                                                  }}
                                                  animate={{
                                                    height: "auto",
                                                    opacity: 1,
                                                  }}
                                                  exit={{
                                                    height: 0,
                                                    opacity: 0,
                                                  }}
                                                  layout
                                                >
                                                  <p className="py-1">
                                                    {subtask.description}
                                                  </p>
                                                  {subtask.tools &&
                                                    subtask.tools.length >
                                                      0 && (
                                                      <div className="mt-2 mb-2 flex flex-wrap gap-2">
                                                        <span className="text-xs font-bold text-zinc-600">
                                                          MCP:
                                                        </span>
                                                        {subtask.tools.map(
                                                          (tool, idx) => (
                                                            <span
                                                              key={idx}
                                                              className="bg-zinc-900 border border-zinc-800 text-zinc-400 rounded px-2 py-0.5 text-[10px] font-bold"
                                                            >
                                                              {tool}
                                                            </span>
                                                          ),
                                                        )}
                                                      </div>
                                                    )}
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </motion.li>
                                        );
                                      })}
                                    </ul>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.li>
                          );
                        })}
                      </ul>
                    </div>
                  </LayoutGroup>
                </motion.div>
              )}
            </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR: FLASHCARDS */}
        <AnimatePresence>
          {showDeck && (
            <motion.aside
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 w-[400px] h-full bg-[#0a0a0c] border-l border-white/5 z-40 flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#111113]">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#F72585]">
                  Deck // {activeTaskTitle}
                </div>
                <button
                  onClick={() => setShowDeck(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 p-6 flex flex-col justify-center overflow-y-auto">
                {cardQueue.length > 0 ? (
                  <>
                    <div className="text-right text-[10px] font-bold text-zinc-500 mb-4">
                      {cardQueue.length} Cards Remaining
                    </div>

                    {/* Flashcard Body */}
                    <div
                      className="w-full h-[400px] relative cursor-pointer"
                      onClick={() => setIsFlipped(!isFlipped)}
                    >
                      <motion.div
                        animate={{ rotateY: isFlipped ? 180 : 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 200,
                          damping: 20,
                        }}
                        className="w-full h-full relative"
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        {/* Front */}
                        <div
                          className="absolute inset-0 bg-zinc-900 border border-[#3A0CA3]/50 rounded-3xl p-8 flex flex-col items-center justify-center text-center"
                          style={{ backfaceVisibility: "hidden" }}
                        >
                          <div className="text-xl font-medium text-white">
                            {cardQueue[0].front}
                          </div>
                          <div className="absolute bottom-6 text-[10px] text-zinc-500 uppercase font-bold">
                            Click or press Space to flip
                          </div>
                        </div>
                        {/* Back */}
                        <div
                          className="absolute inset-0 bg-zinc-900 border border-[#F72585]/50 rounded-3xl p-8 flex flex-col items-center justify-center text-center"
                          style={{
                            backfaceVisibility: "hidden",
                            transform: "rotateY(180deg)",
                          }}
                        >
                          <div className="text-lg text-zinc-100 font-medium">
                            {cardQueue[0].back}
                          </div>
                        </div>
                      </motion.div>
                    </div>

                    {/* Anki Controls */}
                    <div className="mt-8 grid grid-cols-4 gap-2">
                      {["again", "hard", "good", "easy"].map((type) => (
                        <button
                          key={type}
                          onClick={() => handleScoreCard(type)}
                          className="py-3 rounded-xl bg-zinc-900 border border-white/5 hover:border-white/20 text-[10px] font-black uppercase text-zinc-400 hover:text-white transition-all"
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center p-8 bg-zinc-900 border border-[#F72585]/30 rounded-3xl">
                    <CheckCircle2
                      size={48}
                      className="mx-auto text-[#F72585] mb-4"
                    />
                    <h3 className="text-xl font-bold text-white mb-2">
                      Deck Mastered
                    </h3>
                    <button
                      onClick={() => setShowDeck(false)}
                      className="mt-6 px-6 py-2 bg-[#F72585] text-white font-bold rounded-lg text-sm"
                    >
                      Close Deck
                    </button>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-[#111113] hover:bg-zinc-800 rounded-full border border-white/10 text-zinc-400 hover:text-white transition-colors"
    >
      {icon} <span className="text-xs font-medium">{label}</span>
    </button>
  );
}