import { CreateTestForm } from "@/components/tests/create-test-form";

export const metadata = {
  title: "Create Test - A/B Price Testing",
};

export default function NewTestPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-100">Create New Test</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Set up a new A/B price test for your products
        </p>
      </div>

      <CreateTestForm />
    </div>
  );
}
