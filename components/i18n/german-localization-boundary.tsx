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
  const textOriginalsRef = useRef(new Map<Node, string>());
  const attributeOriginalsRef = useRef(new Map<Element, Map<string, string>>());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const textOriginals = textOriginalsRef.current;
    const attributeOriginals = attributeOriginalsRef.current;

    restoreOriginals(root, textOriginals, attributeOriginals);
    if (locale !== "de") return;

    translateTree(root, textOriginals, attributeOriginals);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target, textOriginals);
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, textOriginals);
          if (node.nodeType === Node.ELEMENT_NODE) translateTree(node as Element, textOriginals, attributeOriginals);
        }
        if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
          translateAttributes(mutation.target as Element, attributeOriginals);
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
    return () => {
      observer.disconnect();
      restoreOriginals(root, textOriginals, attributeOriginals);
    };
  }, [locale]);

  return <div ref={rootRef}>{children}</div>;
}

function translateTree(root: Element, textOriginals: Map<Node, string>, attributeOriginals: Map<Element, Map<string, string>>) {
  translateAttributes(root, attributeOriginals);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node, textOriginals);
    node = walker.nextNode();
  }
  for (const element of root.querySelectorAll(attributeNames.map((name) => `[${name}]`).join(","))) {
    translateAttributes(element, attributeOriginals);
  }
}

function translateAttributes(element: Element, attributeOriginals: Map<Element, Map<string, string>>) {
  for (const name of attributeNames) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const translated = translatePhrase(value);
    if (translated !== value) {
      const originals = attributeOriginals.get(element) ?? new Map<string, string>();
      if (!originals.has(name)) originals.set(name, value);
      attributeOriginals.set(element, originals);
      element.setAttribute(name, translated);
    }
  }
}

function translateTextNode(node: Node, textOriginals: Map<Node, string>) {
  const current = node.textContent;
  if (!current || !current.trim()) return;
  if (isUserEditableText(node)) return;
  const translated = translatePhrase(current);
  if (translated !== current) {
    if (!textOriginals.has(node)) textOriginals.set(node, current);
    node.textContent = translated;
  }
}

function restoreOriginals(root: Element, textOriginals: Map<Node, string>, attributeOriginals: Map<Element, Map<string, string>>) {
  for (const [element, originals] of attributeOriginals) {
    if (!root.contains(element)) continue;
    for (const [name, value] of originals) {
      element.setAttribute(name, value);
    }
  }
  attributeOriginals.clear();

  for (const [node, value] of textOriginals) {
    if (!root.contains(node)) continue;
    node.textContent = value;
  }
  textOriginals.clear();
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
