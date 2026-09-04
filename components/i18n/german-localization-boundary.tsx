"use client";

import { useEffect, useRef } from "react";
import { germanUiDictionary, germanUiPatterns } from "@/lib/i18n/german-ui-dictionary";
import type { Locale } from "@/lib/i18n";

type GermanLocalizationBoundaryProps = {
  locale: Locale;
  children: React.ReactNode;
};

const attributeNames = ["placeholder", "title", "aria-label", "alt"];

export function GermanLocalizationBoundary({ locale, children }: GermanLocalizationBoundaryProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || locale !== "de") return;

    translateTree(root);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          if (node.nodeType === Node.ELEMENT_NODE) translateTree(node as Element);
        }
        if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
          translateAttributes(mutation.target as Element);
        }
      }
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: attributeNames,
      characterData: true,
      childList: true,
      subtree: true
    });
    return () => observer.disconnect();
  }, [locale]);

  return <div ref={rootRef}>{children}</div>;
}

function translateTree(root: Element) {
  translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node);
    node = walker.nextNode();
  }
  for (const element of root.querySelectorAll(attributeNames.map((name) => `[${name}]`).join(","))) {
    translateAttributes(element);
  }
}

function translateAttributes(element: Element) {
  for (const name of attributeNames) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const translated = translatePhrase(value);
    if (translated !== value) element.setAttribute(name, translated);
  }
}

function translateTextNode(node: Node) {
  const current = node.textContent;
  if (!current || !current.trim()) return;
  if (isUserEditableText(node)) return;
  const translated = translatePhrase(current);
  if (translated !== current) node.textContent = translated;
}

function translatePhrase(value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const trimmed = value.trim();
  const direct = germanUiDictionary[trimmed];
  if (direct) return `${leading}${direct}${trailing}`;
  for (const [pattern, render] of germanUiPatterns) {
    const match = trimmed.match(pattern);
    if (match) return `${leading}${render(match)}${trailing}`;
  }
  return value;
}

function isUserEditableText(node: Node) {
  const parent = node.parentElement;
  if (!parent) return false;
  return Boolean(parent.closest("textarea,input,[contenteditable='true']"));
}
