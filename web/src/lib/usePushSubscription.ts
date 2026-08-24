"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

// Web Push (native VAPID, no third-party provider). The public key must match the
// backend's VAPID_PUBLIC_KEY (.env) — see web/.env.local.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// The Push API wants the VAPID key as a Uint8Array, but it's distributed/stored as a
// URL-safe base64 string everywhere else (env vars, the browser's own
// PushSubscription.getKey() output) — this is the standard conversion, copied verbatim
// from the Web Push spec's own example code (no library needed for one function).
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  // Typed explicitly as Uint8Array<ArrayBuffer> (not the ArrayBufferLike-generic default
  // TS 5.7+ infers) — PushManager.subscribe's applicationServerKey wants a concrete
  // ArrayBuffer-backed view, and `new Uint8Array(length)` is always ArrayBuffer-backed,
  // never SharedArrayBuffer-backed, so this is a type-only correction, not a behavior change.
  const outputArray: Uint8Array<ArrayBuffer> = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

interface PushSubscriptionState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Manages this browser's Web Push subscription: registers the service worker
 * (web/public/sw.js), checks the current subscription on mount, and exposes
 * subscribe()/unsubscribe() that both register with the browser's Push API AND sync
 * the resulting endpoint with the backend (POST /api/push/subscribe,
 * POST /api/push/unsubscribe — see src/routes/push.routes.ts).
 */
export function usePushSubscription() {
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    isSubscribed: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    if (!isPushSupported()) {
      setState({ isSupported: false, isSubscribed: false, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) {
          setState({ isSupported: true, isSubscribed: subscription !== null, isLoading: false, error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            isSupported: true,
            isSubscribed: false,
            isLoading: false,
            error: err instanceof Error ? err.message : "Failed to check push subscription status.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      if (!VAPID_PUBLIC_KEY) {
        throw new Error("Push notifications aren't configured for this environment yet.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission was denied.");
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      await apiFetch("/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });

      setState({ isSupported: true, isSubscribed: true, isLoading: false, error: null });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Something went wrong.",
      }));
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await apiFetch("/push/unsubscribe", {
          method: "POST",
          body: JSON.stringify({ endpoint }),
        });
      }

      setState({ isSupported: true, isSubscribed: false, isLoading: false, error: null });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Something went wrong.",
      }));
    }
  }, []);

  return { ...state, subscribe, unsubscribe };
}
