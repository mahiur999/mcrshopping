"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ShoppingCart,
  Layers,
  History,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  RefreshCw,
  Printer,
  Download,
  Upload,
  Share2,
  Check,
  PackagePlus,
} from "lucide-react";

// Supabase Client ইনিশিয়ালাইজেশন
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface PantryItem {
  id: string;
  name: string;
  category: string;
  default_unit: string;
}

interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  is_bought: boolean;
  updated_by: string;
}

interface HistoryRecord {
  id: string;
  date: string;
  total_cost: number;
  buyer_name: string;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    total_price: number;
  }>;
}

export default function SmartShoppingApp() {
  const [activeTab, setActiveTab] = useState<"list" | "pantry" | "history">("list");
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [historyList, setHistoryList] = useState<HistoryRecord[]>([]);
  const [userName, setUserName] = useState<string>("সদস্য ১");
  const [selectedReceipt, setSelectedReceipt] = useState<HistoryRecord | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // নতুন আইটেম স্টেট (প্যান্ট্রি)
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("মুদি");
  const [newItemUnit, setNewItemUnit] = useState("কেজি");

  // ডাটা লোড ও রিয়েল-টাইম সাবস্ক্রিপশন
  useEffect(() => {
    fetchShoppingList();
    fetchPantry();
    fetchHistory();

    const channel = supabase
      .channel("public:shopping_list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_list" },
        () => {
          fetchShoppingList();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchShoppingList = async () => {
    const { data } = await supabase
      .from("shopping_list")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setShoppingList(data);
  };

  const fetchPantry = async () => {
    const { data } = await supabase
      .from("master_pantry")
      .select("*")
      .order("name", { ascending: true });
    if (data) setPantryItems(data);
  };

  const fetchHistory = async () => {
    const { data } = await supabase
      .from("shopping_history")
      .select("*")
      .order("date", { ascending: false });
    if (data) setHistoryList(data);
  };

  // প্যান্ট্রি থেকে শপিং লিস্টে নেওয়া
  const addPantryToShopping = async (item: PantryItem) => {
    const exists = shoppingList.find((i) => i.name.toLowerCase() === item.name.toLowerCase());
    if (exists) {
      alert("আইটেমটি আগেই বাজারের লিস্টে যুক্ত করা আছে!");
      return;
    }

    await supabase.from("shopping_list").insert([
      {
        name: item.name,
        category: item.category,
        quantity: 1,
        unit: item.default_unit,
        unit_price: 0,
        total_price: 0,
        is_bought: false,
        updated_by: userName,
      },
    ]);
  };

  // নতুন প্যান্ট্রি পণ্য সংরক্ষণ
  const handleCreatePantryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    await supabase.from("master_pantry").insert([
      {
        name: newItemName.trim(),
        category: newItemCategory,
        default_unit: newItemUnit,
      },
    ]);

    setNewItemName("");
    fetchPantry();
  };

  // বাজারের মূল্য বা পরিমাণ আপডেট করা
  const updateShoppingItem = async (id: string, updates: Partial<ShoppingItem>) => {
    const current = shoppingList.find((i) => i.id === id);
    if (!current) return;

    const qty = updates.quantity !== undefined ? updates.quantity : current.quantity;
    const price = updates.unit_price !== undefined ? updates.unit_price : current.unit_price;
    const total = qty * price;

    await supabase
      .from("shopping_list")
      .update({ ...updates, total_price: total, updated_by: userName })
      .eq("id", id);
  };

  // বাজার আইটেম ডিলিট
  const deleteShoppingItem = async (id: string) => {
    await supabase.from("shopping_list").delete().eq("id", id);
  };

  // বাজার সমাপ্তি ও হিস্ট্রিতে সেভ করা
  const completeShoppingTrip = async () => {
    if (shoppingList.length === 0) return;

    const totalCost = shoppingList.reduce((acc, curr) => acc + curr.total_price, 0);

    const historyData = {
      date: new Date().toISOString(),
      total_cost: totalCost,
      buyer_name: userName,
      items: shoppingList.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
      })),
    };

    const { data, error } = await supabase.from("shopping_history").insert([historyData]).select();

    if (!error && data) {
      await supabase.from("shopping_list").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      fetchHistory();
      setSelectedReceipt(data[0]);
    }
  };

  // সম্পূর্ণ ব্যাকআপ JSON ডাউনলোড
  const exportFullBackup = () => {
    const fullData = {
      pantry: pantryItems,
      current_list: shoppingList,
      history: historyList,
      backup_date: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Smart_Shopping_Backup_${new Date().toLocaleDateString("en-CA")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // লিঙ্ক কপি করা
  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // হিসাব ক্যালকুলেশন
  const grandTotal = useMemo(
    () => shoppingList.reduce((sum, item) => sum + (item.total_price || 0), 0),
    [shoppingList]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* টপ হেডার */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-40 px-4 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-emerald-400" />
            <span className="font-bold text-lg text-emerald-400">স্মার্ট শপিং খাতা</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="আপনার নাম"
              className="bg-slate-800 border border-slate-700 text-xs px-2.5 py-1.5 rounded-lg text-slate-200 outline-none w-24 text-center focus:border-emerald-500"
            />
            <button
              onClick={copyShareLink}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-xs border border-slate-700 px-3 py-1.5 rounded-lg transition"
            >
              {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copySuccess ? "কপি হয়েছে!" : "শেয়ার"}</span>
            </button>
            <button
              onClick={exportFullBackup}
              title="সম্পূর্ণ ব্যাকআপ ডাউনলোড করুন"
              className="bg-slate-800 hover:bg-slate-700 text-xs border border-slate-700 p-1.5 rounded-lg transition"
            >
              <Download className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>
      </header>

      {/* নেভিগেশন ট্যাব */}
      <div className="bg-slate-900/40 border-b border-slate-800 px-4">
        <div className="max-w-4xl mx-auto flex">
          <button
            onClick={() => setActiveTab("list")}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition ${
              activeTab === "list"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            বর্তমান বাজার ({shoppingList.length})
          </button>
          <button
            onClick={() => setActiveTab("pantry")}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition ${
              activeTab === "pantry"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            প্রয়োজনীয় ক্যাটালগ
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition ${
              activeTab === "history"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <History className="w-4 h-4" />
            বাজার হিস্ট্রি ও মেমো
          </button>
        </div>
      </div>

      {/* মূল কনটেন্ট */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4">
        {/* ট্যাব ১: বর্তমান শপিং তালিকা */}
        {activeTab === "list" && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400">সর্বমোট প্রাক্কলিত খরচ</p>
                <h2 className="text-2xl font-bold text-emerald-400">৳ {grandTotal.toLocaleString("bn-BD")}</h2>
              </div>
              <button
                onClick={completeShoppingTrip}
                disabled={shoppingList.length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition shadow-lg shadow-emerald-950 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                বাজার সম্পন্ন করুন
              </button>
            </div>

            {shoppingList.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
                <ShoppingCart className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400">বাজারের তালিকা খালি!</p>
                <button
                  onClick={() => setActiveTab("pantry")}
                  className="mt-3 text-emerald-400 text-sm hover:underline"
                >
                  প্যান্ট্রি ক্যাটালগ থেকে যোগ করুন →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {shoppingList.map((item) => (
                  <div
                    key={item.id}
                    className={`border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 transition ${
                      item.is_bought
                        ? "bg-slate-900/30 border-slate-800/60 opacity-60"
                        : "bg-slate-900 border-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-[140px]">
                      <button
                        onClick={() => updateShoppingItem(item.id, { is_bought: !item.is_bought })}
                        className="text-slate-400 hover:text-emerald-400 transition"
                      >
                        {item.is_bought ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </button>
                      <div>
                        <h4 className={`font-medium ${item.is_bought ? "line-through text-slate-400" : ""}`}>
                          {item.name}
                        </h4>
                        <span className="text-xs text-slate-500">{item.category}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* পরিমাণ */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          value={item.quantity || ""}
                          onChange={(e) =>
                            updateShoppingItem(item.id, { quantity: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-center text-sm outline-none"
                        />
                        <span className="text-xs text-slate-400">{item.unit}</span>
                      </div>

                      {/* একক মূল্য */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">৳</span>
                        <input
                          type="number"
                          placeholder="দর"
                          value={item.unit_price || ""}
                          onChange={(e) =>
                            updateShoppingItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })
                          }
                          className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-center text-sm outline-none focus:border-emerald-500"
                        />
                      </div>

                      {/* মোট টাকা */}
                      <div className="w-20 text-right">
                        <span className="text-sm font-semibold text-emerald-400">
                          ৳{item.total_price.toFixed(0)}
                        </span>
                      </div>

                      {/* ডিলিট */}
                      <button
                        onClick={() => deleteShoppingItem(item.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ট্যাব ২: প্যান্ট্রি ক্যাটালগ */}
        {activeTab === "pantry" && (
          <div className="space-y-4">
            <form onSubmit={handleCreatePantryItem} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-300">
                <PackagePlus className="w-4 h-4 text-emerald-400" />
                নতুন সামগ্রী ক্যাটালগে যোগ করুন
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="সামগ্রীর নাম (যেমন: পেঁয়াজ)"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 sm:col-span-2"
                />
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none text-slate-300"
                >
                  <option value="মুদি">মুদি</option>
                  <option value="সবজি">সবজি</option>
                  <option value="মাছ ও মাংস">মাছ ও মাংস</option>
                  <option value="মসলা">মসলা</option>
                  <option value="টয়লেট্রিজ">টয়লেট্রিজ</option>
                  <option value="অন্যান্য">অন্যান্য</option>
                </select>
                <input
                  type="text"
                  placeholder="একক (কেজি/পিস/লিটার)"
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
              <button
                type="submit"
                className="mt-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg transition font-medium"
              >
                তালিকায় সংরক্ষণ করুন
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pantryItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <h4 className="font-medium text-slate-200">{item.name}</h4>
                    <span className="text-xs text-slate-500">
                      {item.category} • একক: {item.default_unit}
                    </span>
                  </div>
                  <button
                    onClick={() => addPantryToShopping(item)}
                    className="flex items-center gap-1 bg-slate-800 hover:bg-emerald-600 hover:text-white text-xs border border-slate-700 px-3 py-1.5 rounded-lg transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    বাজারে আনুন
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ট্যাব ৩: হিস্ট্রি ও মেমো */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {historyList.length === 0 ? (
              <p className="text-center py-10 text-slate-500">এখনো কোনো বাজারের হিস্ট্রি নেই।</p>
            ) : (
              historyList.map((record) => (
                <div key={record.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 mb-3 gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        {new Date(record.date).toLocaleDateString("bn-BD", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-slate-500">ক্রেতা: {record.buyer_name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-emerald-400">৳ {record.total_cost}</span>
                      <button
                        onClick={() => setSelectedReceipt(record)}
                        className="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded border border-slate-700 flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        ক্যাশমেমো
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1">
                    {record.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {item.name} ({item.quantity} {item.unit} @ ৳{item.unit_price})
                        </span>
                        <span>৳{item.total_price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* ক্যাশমেমো মডাল (প্রিন্ট ফ্রেন্ডলি) */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 w-full max-w-md rounded-xl p-6 shadow-2xl relative">
            <div className="text-center border-b pb-4 mb-4">
              <h2 className="text-xl font-bold">ক্যাশ রিসিট / বাজার ভাউচার</h2>
              <p className="text-xs text-slate-500 mt-1">
                তারিখ: {new Date(selectedReceipt.date).toLocaleString("bn-BD")}
              </p>
              <p className="text-xs text-slate-500">ক্রেতা: {selectedReceipt.buyer_name}</p>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b">
                    <th className="py-1">বিবরণ</th>
                    <th className="py-1 text-center">পরিমাণ</th>
                    <th className="py-1 text-right">দর</th>
                    <th className="py-1 text-right">মোট</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReceipt.items.map((item, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 font-medium">{item.name}</td>
                      <td className="py-1.5 text-center">{item.quantity} {item.unit}</td>
                      <td className="py-1.5 text-right">৳{item.unit_price}</td>
                      <td className="py-1.5 text-right">৳{item.total_price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t pt-3 flex justify-between font-bold text-base mb-6">
              <span>সর্বমোট পরিশোধ:</span>
              <span className="text-emerald-700">৳ {selectedReceipt.total_cost}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-slate-900 text-white py-2 rounded text-sm font-medium hover:bg-slate-800 transition flex items-center justify-center gap-1"
              >
                <Printer className="w-4 h-4" />
                প্রিন্ট / PDF
              </button>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="flex-1 bg-slate-200 text-slate-700 py-2 rounded text-sm font-medium hover:bg-slate-300 transition"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
