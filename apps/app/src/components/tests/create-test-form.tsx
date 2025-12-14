"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Variant {
  name: string;
  weight: number;
  discount_code: string;
  price_modifier_cents: number;
}

export function CreateTestForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productIds, setProductIds] = useState("");
  const [variants, setVariants] = useState<Variant[]>([
    { name: "Control", weight: 50, discount_code: "", price_modifier_cents: 0 },
    { name: "Variant B", weight: 50, discount_code: "", price_modifier_cents: -500 },
  ]);

  function updateVariant(index: number, field: keyof Variant, value: string | number) {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setVariants(newVariants);
  }

  function addVariant() {
    if (variants.length >= 4) return;

    const newWeight = Math.floor(100 / (variants.length + 1));
    const newVariants = variants.map(v => ({ ...v, weight: newWeight }));
    newVariants.push({
      name: `Variant ${String.fromCharCode(65 + variants.length)}`,
      weight: 100 - newWeight * variants.length,
      discount_code: "",
      price_modifier_cents: 0,
    });
    setVariants(newVariants);
  }

  function removeVariant(index: number) {
    if (variants.length <= 2) return;

    const newVariants = variants.filter((_, i) => i !== index);
    const equalWeight = Math.floor(100 / newVariants.length);
    const remainder = 100 - equalWeight * newVariants.length;

    setVariants(
      newVariants.map((v, i) => ({
        ...v,
        weight: equalWeight + (i === 0 ? remainder : 0),
      }))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Validate weights sum to 100
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      setError("Variant weights must sum to 100");
      setLoading(false);
      return;
    }

    // Parse product IDs
    const parsedProductIds = productIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id);

    if (parsedProductIds.length === 0) {
      setError("At least one product ID is required");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          product_ids: parsedProductIds,
          variants: variants.map(v => ({
            name: v.name,
            weight: v.weight,
            discount_code: v.discount_code || undefined,
            price_modifier_cents: v.price_modifier_cents || undefined,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create test");
      }

      const { data } = await response.json();
      router.push(`/tests/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create test");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100">Basic Information</h2>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-zinc-400 mb-2">
            Test Name *
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            placeholder="e.g., Holiday Price Test"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-zinc-400 mb-2">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            placeholder="Describe what you're testing..."
          />
        </div>

        <div>
          <label htmlFor="productIds" className="block text-sm font-medium text-zinc-400 mb-2">
            Product IDs *
          </label>
          <input
            type="text"
            id="productIds"
            value={productIds}
            onChange={(e) => setProductIds(e.target.value)}
            required
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            placeholder="123456789, 987654321"
          />
          <p className="text-xs text-zinc-500 mt-1">
            Comma-separated Shopify product IDs
          </p>
        </div>
      </div>

      {/* Variants */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Variants</h2>
          {variants.length < 4 && (
            <button
              type="button"
              onClick={addVariant}
              className="text-sm text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              + Add Variant
            </button>
          )}
        </div>

        <div className="space-y-4">
          {variants.map((variant, index) => (
            <div
              key={index}
              className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      index === 0 ? "bg-zinc-500" : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-sm font-medium text-zinc-300">
                    {index === 0 ? "Control" : `Variant ${index + 1}`}
                  </span>
                </div>
                {variants.length > 2 && index > 0 && (
                  <button
                    type="button"
                    onClick={() => removeVariant(index)}
                    className="text-sm text-zinc-500 hover:text-red-500 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={variant.name}
                    onChange={(e) => updateVariant(index, "name", e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Weight %</label>
                  <input
                    type="number"
                    value={variant.weight}
                    onChange={(e) =>
                      updateVariant(index, "weight", parseInt(e.target.value) || 0)
                    }
                    min={0}
                    max={100}
                    required
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Discount Code
                  </label>
                  <input
                    type="text"
                    value={variant.discount_code}
                    onChange={(e) => updateVariant(index, "discount_code", e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="AUTO_GENERATED"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Price Modifier (cents)
                  </label>
                  <input
                    type="number"
                    value={variant.price_modifier_cents}
                    onChange={(e) =>
                      updateVariant(
                        index,
                        "price_modifier_cents",
                        parseInt(e.target.value) || 0
                      )
                    }
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="-500 for $5 off"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg">
          <span className="text-sm text-zinc-500">Total Weight:</span>
          <span
            className={`text-sm font-medium ${
              variants.reduce((sum, v) => sum + v.weight, 0) === 100
                ? "text-emerald-500"
                : "text-red-500"
            }`}
          >
            {variants.reduce((sum, v) => sum + v.weight, 0)}%
          </span>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg text-sm font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? "Creating..." : "Create Test"}
        </button>
      </div>
    </form>
  );
}
