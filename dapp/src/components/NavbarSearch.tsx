import { navigate } from "astro:transitions/client";
import { useState, useEffect } from "react";
import { useStore } from "@nanostores/react";
import { Button, IconButton } from "components/ui";
import { CloseIcon, SearchIcon } from "components/ui/icons";

import { openModal } from "../utils/modals";
import { connectedPublicKey } from "../utils/store";
import { toast } from "../utils/utils";

// Constants for URL handling
const HOME_PATH = "/";

const NavbarSearch = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const publicKeyFromStore = useStore(connectedPublicKey);
  const isWalletConnected = !!publicKeyFromStore;

  const toSafeInternalPath = (rawUrl: string | null): string => {
    if (!rawUrl) return "";
    const trimmed = rawUrl.trim();
    if (!trimmed.startsWith("/")) return "";
    if (trimmed.startsWith("//")) return "";
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.origin !== window.location.origin) return "";
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return "";
    }
  };

  useEffect(() => {
    setIsClient(true);
    saveOriginalUrl();
    initializeSearchTerm();
  }, []);

  // Save the original URL when the component mounts
  const saveOriginalUrl = () => {
    if (window.location.pathname !== HOME_PATH) {
      setOriginalUrl(window.location.pathname + window.location.search);
      return;
    }

    const referrer = document.referrer;
    if (
      referrer &&
      referrer.includes(window.location.origin) &&
      !referrer.endsWith("/")
    ) {
      try {
        const referrerUrl = new URL(referrer);
        setOriginalUrl(referrerUrl.pathname + referrerUrl.search);
      } catch {
        // Silent error handling
      }
    }

    const searchParams = new URLSearchParams(window.location.search);
    const fromUrl = searchParams.get("from");
    const safeFromUrl = toSafeInternalPath(fromUrl);
    if (safeFromUrl) {
      setOriginalUrl(safeFromUrl);
    }
  };

  // Initialize search term from URL
  const initializeSearchTerm = () => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlSearchTerm = searchParams.get("search");
      if (urlSearchTerm) {
        setSearchTerm(urlSearchTerm);
      }
    } catch {
      // Silent error handling
    }
  };

  const performClearNavigation = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const fromUrl = searchParams.get("from");
    const safeFromUrl = toSafeInternalPath(fromUrl);
    const safeOriginalUrl = toSafeInternalPath(originalUrl);

    if (safeFromUrl) {
      navigate(safeFromUrl);
    } else if (safeOriginalUrl) {
      navigate(safeOriginalUrl);
    } else if (
      window.location.pathname === HOME_PATH &&
      window.location.search
    ) {
      navigate(HOME_PATH, { history: "replace" });
    }
  };

  const handleSearch = async () => {
    if (!searchTerm) {
      performClearNavigation();
      return;
    }

    if (window.location.pathname !== HOME_PATH) {
      setOriginalUrl(window.location.pathname + window.location.search);
    }

    // Members are accounts (G...) or smart accounts (C...).
    const isStellarAddress =
      /^[GC]/.test(searchTerm) && searchTerm.length >= 56;

    // The home page lists the results; from elsewhere, it remembers where
    // to go back to.
    const url = new URL(HOME_PATH, window.location.origin);
    url.searchParams.set("search", searchTerm);
    if (isStellarAddress) url.searchParams.set("member", "true");
    const isOnHomePage = window.location.pathname === HOME_PATH;
    if (!isOnHomePage) {
      url.searchParams.set(
        "from",
        window.location.pathname + window.location.search,
      );
    }
    navigate(url.pathname + url.search, {
      history: isOnHomePage ? "replace" : "push",
    });
  };

  const handleAddProject = () => {
    if (!isWalletConnected) {
      toast.error(
        "Connect Wallet",
        "Please connect your wallet first to add a project",
      );
      return;
    }

    openModal("createProject", {});
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    performClearNavigation();
  };

  const toggleSearchVisibility = () => {
    setIsSearchVisible(!isSearchVisible);
  };

  const buttonTitle = isWalletConnected
    ? "Add Project"
    : "Connect wallet to add project";

  const field = (autoFocus: boolean) => (
    <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-surface px-3 text-ink-muted focus-within:border-focus focus-within:ring-4 focus-within:ring-accent/40 sm:h-10">
      <SearchIcon />
      <input
        type="search"
        aria-label="Search projects or members"
        placeholder="Search projects or members"
        autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-subtle"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSearch();
        }}
      />
      {searchTerm && (
        <IconButton
          label="Clear search"
          onClick={handleClearSearch}
          className="-mr-2 size-8 sm:size-8"
        >
          <CloseIcon />
        </IconButton>
      )}
    </div>
  );

  const addProject = (
    <Button
      tone="secondary"
      size="sm"
      onClick={handleAddProject}
      title={buttonTitle}
      className="shrink-0"
    >
      New project
    </Button>
  );

  return (
    <div className="flex w-full min-w-0 items-center gap-3">
      {/* Phones: a search button opens the field over the bar */}
      <div className="flex w-full min-w-0 items-center gap-2 md:hidden">
        {isSearchVisible ? (
          <>
            {field(true)}
            <IconButton
              label="Close and clear search"
              onClick={() => {
                setSearchTerm("");
                toggleSearchVisibility();
              }}
            >
              <CloseIcon />
            </IconButton>
          </>
        ) : (
          <>
            <IconButton label="Search" onClick={toggleSearchVisibility}>
              <SearchIcon />
            </IconButton>
            {isClient && isWalletConnected && (
              <span className="ml-auto">{addProject}</span>
            )}
          </>
        )}
      </div>
      <div className="hidden w-full min-w-0 items-center gap-3 md:flex">
        <div className="flex max-w-md min-w-0 flex-1">{field(false)}</div>
        {/* The home page offers it in its hero. */}
        {isClient && window.location.pathname !== HOME_PATH && addProject}
      </div>
    </div>
  );
};

export default NavbarSearch;
