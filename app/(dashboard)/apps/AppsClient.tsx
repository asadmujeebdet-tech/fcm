"use client";

import { useEffect, useState } from "react";
import { Plus, Smartphone, Trash2, Pencil, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Card, EmptyState, Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { FirebaseAppPublic } from "@/types/database";

export function AppsClient() {
  const [apps, setApps] = useState<FirebaseAppPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<FirebaseAppPublic | null>(null);
  const [deleteApp, setDeleteApp] = useState<FirebaseAppPublic | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3200);
  }

  async function loadApps() {
    setLoading(true);
    const res = await fetch("/api/apps");
    const data = await res.json();
    setApps(data.apps ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadApps();
  }, []);

  async function handleToggleActive(app: FirebaseAppPublic) {
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, is_active: !a.is_active } : a)));
    const res = await fetch(`/api/apps/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !app.is_active }),
    });
    if (!res.ok) {
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, is_active: app.is_active } : a)));
      const data = await res.json().catch(() => null);
      showToast("error", data?.error ?? "Unable to update app status");
      return;
    }
    showToast("success", `${app.name} is now ${!app.is_active ? "active" : "inactive"}`);
  }

  function handleDelete(app: FirebaseAppPublic) {
    setDeleteApp(app);
  }

  async function confirmDelete() {
    if (!deleteApp) return;
    const app = deleteApp;
    setDeleteApp(null);
    const res = await fetch(`/api/apps/${app.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      showToast("error", data?.error ?? "Unable to delete app");
      return;
    }
    setApps((prev) => prev.filter((a) => a.id !== app.id));
    showToast("success", `${app.name} deleted successfully`);
  }

  return (
    <div className="app-page space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Apps</h1>
          <p className="mt-1 text-sm text-ink2">
            Every Firebase project you can broadcast to. Credentials are encrypted at rest.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingApp(null);
            setModalOpen(true);
          }}
        >
          <Plus size={15} /> Add app
        </Button>
      </div>

      {!loading && apps.length === 0 ? (
        <EmptyState
          title="No apps connected yet"
          description="Add a Firebase project's service account to start broadcasting to it. You can add as many as you manage."
          action={<Button onClick={() => setModalOpen(true)}>Add your first app</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-ink2">
                <th className="w-[24%] px-5 py-3 font-normal">App</th>
                <th className="w-[22%] px-5 py-3 font-normal">Project ID</th>
                <th className="w-[24%] px-5 py-3 font-normal">Topic</th>
                <th className="w-[12%] px-5 py-3 font-normal">Status</th>
                <th className="w-[18%] px-5 py-3 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface2 text-ink2">
                        {app.app_icon_url ? (
                          <img src={app.app_icon_url} alt={app.name} className="h-full w-full object-cover" />
                        ) : (
                          <Smartphone size={14} />
                        )}
                      </div>
                      <span className="truncate text-white">{app.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-ink2">{app.project_id}</td>
                  <td className="px-5 py-3">
                    <span className="block break-words font-mono text-xs text-ink2">
                      {app.topic || "(none)"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleToggleActive(app)}>
                      <Badge tone={app.is_active ? "wave" : "muted"}>
                        {app.is_active ? "Active" : "Paused"}
                      </Badge>
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => {
                          setEditingApp(app);
                          setModalOpen(true);
                        }}
                        className="text-ink2 hover:text-white"
                        aria-label={`Edit ${app.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(app)}
                        className="text-ink2 hover:text-danger"
                        aria-label={`Delete ${app.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <AppFormModal
        open={modalOpen}
        editingApp={editingApp}
        onClose={() => setModalOpen(false)}
        onSaved={(message) => {
          setModalOpen(false);
          loadApps();
          showToast("success", message);
        }}
      />

      {deleteApp && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Delete app?</h2>
                <p className="mt-2 text-xs leading-5 text-ink2">Remove <span className="font-medium text-white">"{deleteApp.name}"</span>? This action cannot be undone.</p>
              </div>
              <button type="button" onClick={() => setDeleteApp(null)} className="text-ink2 transition hover:text-white" aria-label="Close delete confirmation"><X size={16} /></button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDeleteApp(null)}>Cancel</Button>
              <Button type="button" variant="danger" onClick={confirmDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed right-5 top-5 z-[130] animate-[toast-in_.22s_ease-out]">
          <div className="flex min-w-[280px] max-w-sm items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-2xl">
            {toast.type === "success" ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-wave" /> : <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" />}
            <p className="flex-1 text-xs leading-5 text-white">{toast.message}</p>
            <button type="button" onClick={() => setToast(null)} className="text-ink2 transition hover:text-white" aria-label="Close notification"><X size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function AppFormModal({
  open,
  editingApp,
  onClose,
  onSaved,
}: {
  open: boolean;
  editingApp: FirebaseAppPublic | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [topic, setDefaultTopic] = useState("");
  const [appIconUrl, setAppIconUrl] = useState("");
  const [serviceAccount, setServiceAccount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (editingApp) {
      setName(editingApp.name);
      setDefaultTopic(editingApp.topic ?? "");
      setAppIconUrl(editingApp.app_icon_url ?? "");
      setIsActive(editingApp.is_active);
    } else {
      setName("");
      setDefaultTopic("");
      setAppIconUrl("");
      setServiceAccount("");
      setIsActive(true);
    }
    setError(null);
  }, [editingApp, open]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setServiceAccount(await file.text());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = editingApp
      ? await fetch(`/api/apps/${editingApp.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, topic, appIconUrl, isActive }),
        })
      : await fetch("/api/apps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, topic, appIconUrl, serviceAccount, isActive }),
        });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    onSaved(editingApp ? "App updated successfully" : "App created successfully");
  }

  return (
    <Modal open={open} onClose={onClose} themeAware title={editingApp ? "Edit app" : "Add a Firebase app"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My App" required />
        </div>

        <div>
          <Label>Topic</Label>
          <Input
            value={topic}
            onChange={(e) => setDefaultTopic(e.target.value)}
            placeholder="news"
          />
        </div>

        <div>
          <Label>Status</Label>
          <div className="mt-2 flex gap-3">
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-2.5 text-xs text-white transition hover:border-wave/50">
              <input type="radio" name="app-status" checked={isActive} onChange={() => setIsActive(true)} className="h-4 w-4 accent-[#3FD6C6]" />
              Active
            </label>
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-2.5 text-xs text-white transition hover:border-danger/50">
              <input type="radio" name="app-status" checked={!isActive} onChange={() => setIsActive(false)} className="h-4 w-4 accent-[#FF5C68]" />
              Inactive
            </label>
          </div>
        </div>

        <div>
          <Label>App icon URL</Label>
          <Input
            value={appIconUrl}
            onChange={(e) => setAppIconUrl(e.target.value)}
            placeholder="https://play-lh.googleusercontent.com/..."
          />
        </div>

        {!editingApp && (
          <div>
            <Label>Service account JSON</Label>
            <input
              type="file"
              accept="application/json"
              onChange={handleFileUpload}
              className="mb-2 block w-full text-xs text-ink2 file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-xs file:text-white hover:file:bg-border"
            />
            <Textarea
              value={serviceAccount}
              onChange={(e) => setServiceAccount(e.target.value)}
              rows={5}
              placeholder='Or paste the full JSON here'
              className="font-mono text-xs"
              required
            />
            <p className="mt-1.5 text-xs text-ink2">
              Copy the Firebase service account JSON from the Firebase console and paste it here.
            </p>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : editingApp ? "Save changes" : "Add app"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
