"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import type { BrainDocMeta } from "@/lib/brain/types";
import { DocumentRow, EmptyKnowledge } from "./workspace-ui";

export type KnowledgeSectionData = {
  title: string;
  description: string;
  docs: BrainDocMeta[];
};

export function KnowledgeBrowser({ sections }: { sections: KnowledgeSectionData[] }) {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState("All sources");
  const populatedSections = sections.filter((section) => section.docs.length > 0);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return populatedSections
      .filter((section) => activeSection === "All sources" || section.title === activeSection)
      .map((section) => ({
        ...section,
        docs: section.docs.filter((doc) => {
          if (!normalizedQuery) return true;
          return [doc.title, doc.description, doc.path, doc.doc_type]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedQuery));
        }),
      }))
      .filter((section) => section.docs.length > 0);
  }, [activeSection, populatedSections, query]);

  const resultCount = results.reduce((total, section) => total + section.docs.length, 0);

  return (
    <div className="sana-knowledge-browser">
      <label className="sana-search-field">
        <Search size={19} />
        <span className="sr-only">Search authorized knowledge</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search company knowledge"
        />
        <span className="sana-search-submit" aria-hidden>
          <ArrowRight size={17} />
        </span>
      </label>

      <div className="sana-filter-row" aria-label="Knowledge filters">
        {["All sources", ...populatedSections.slice(0, 4).map((section) => section.title)].map((label) => (
          <button
            type="button"
            key={label}
            className={activeSection === label ? "is-active" : ""}
            onClick={() => setActiveSection(label)}
          >
            {label}
          </button>
        ))}
        <span>{resultCount} results</span>
      </div>

      {results.length > 0 ? (
        <div className="sana-search-results">
          {results.map((section) => (
            <section key={section.title}>
              <header>
                <div>
                  <h2>{section.title}</h2>
                  <p>{section.description}</p>
                </div>
                <span>{section.docs.length}</span>
              </header>
              <div>
                {section.docs.map((doc) => (
                  <DocumentRow key={doc.path} doc={doc} context={doc.description || undefined} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyKnowledge
          title="No matching knowledge"
          description="Try a different phrase or broaden the selected source filter."
        />
      )}
    </div>
  );
}
