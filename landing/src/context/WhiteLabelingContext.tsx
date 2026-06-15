import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import {
    DEFAULT_BRANDING_SNAPSHOT,
    type WhitelabelBrandingSnapshot,
} from "../services/whitelabel/serverFetch";

export interface WhiteLabelingData {
    companyName: string;
    logoRect: string | null;
    logoRectDark: string | null;
    logoSquare: string | null;
    logoSquareDark: string | null;
    isLoading: boolean;
    favicon?: string | null;
    featureAccess: string[] | null;
    homeConfig: any | null;
    isWhiteLabeled: boolean;
    /** Re-fetch the whitelabel resource for the current domain. */
    refresh: () => Promise<void>;
}

const WhiteLabelingContext = createContext<WhiteLabelingData | undefined>(undefined);

interface WhiteLabelingProviderProps {
    children: ReactNode;
    /**
     * Server-rendered branding for the current request hostname. Passed in
     * from app/layout.tsx so first paint already has the correct values and
     * the browser never has to call Hasura directly (avoids cross-origin).
     */
    initialBranding?: WhitelabelBrandingSnapshot;
}

export const WhiteLabelingProvider: React.FC<WhiteLabelingProviderProps> = ({
    children,
    initialBranding,
}) => {
    const seed = initialBranding ?? DEFAULT_BRANDING_SNAPSHOT;
    const [branding, setBranding] = useState<Omit<WhiteLabelingData, "refresh">>({
        ...seed,
        isLoading: false,
    });

    const isMountedRef = useRef(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/whitelabel", { cache: "no-store" });
            if (!res.ok) return;
            const snapshot: WhitelabelBrandingSnapshot = await res.json();
            if (!isMountedRef.current) return;

            setBranding({ ...snapshot, isLoading: false });

            if (snapshot.companyName) {
                document.title = snapshot.companyName;
            }
            if (snapshot.favicon) {
                const link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
                if (link) link.href = snapshot.favicon;
            }
        } catch (error) {
            console.error("Error fetching whitelisting resources:", error);
        }
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    return (
        <WhiteLabelingContext.Provider value={{ ...branding, refresh }}>
            {children}
        </WhiteLabelingContext.Provider>
    );
};

export const useWhiteLabelingContext = () => {
    const context = useContext(WhiteLabelingContext);
    if (context === undefined) {
        throw new Error("useWhiteLabelingContext must be used within a WhiteLabelingProvider");
    }
    return context;
};
