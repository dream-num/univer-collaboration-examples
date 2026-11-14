import { UNIT_TYPES, unitLink, type UnitSummary } from "../../shared/units";
import { icon, unitIcon } from "./icons";

interface SidebarOptions {
  onCreate(): void;
  onImport(): void;
}

export function createSidebar(options: SidebarOptions) {
  const sidebar = document.querySelector<HTMLElement>("#sidebar")!;
  sidebar.innerHTML = `
    <div class="au-brand">
      <span class="au-brand-symbol"></span>
      <div><h2>All Unit</h2><p>Univer Collaboration</p></div>
    </div>
    <div class="au-sidebar-actions" role="group" aria-label="Add a Unit">
      <button class="au-button au-button-primary" type="button" data-action="new">New Unit</button>
      <button class="au-button au-button-secondary" type="button" data-action="import">Import</button>
    </div>
    <div class="au-list-heading"><span>ALL UNITS</span><span class="au-unit-count">0</span></div>
    <button id="unit-switcher" class="au-mobile-switcher" type="button" aria-controls="units" aria-expanded="false">
      <span>All units <span class="au-unit-count">0</span></span>
    </button>
    <nav id="units" class="au-unit-list" aria-label="Units"></nav>
    <p class="au-list-message" role="status">Loading units…</p>
    <p class="au-sidebar-footer"><span>Open in another tab to collaborate</span></p>
  `;
  sidebar.querySelector(".au-brand-symbol")!.append(icon("brand"));
  sidebar.querySelector(".au-sidebar-footer")!.prepend(icon("people"));
  const create = sidebar.querySelector<HTMLButtonElement>('[data-action="new"]')!;
  const importButton = sidebar.querySelector<HTMLButtonElement>('[data-action="import"]')!;
  create.prepend(icon("plus"));
  importButton.prepend(icon("upload"));
  const switcher = sidebar.querySelector<HTMLButtonElement>("#unit-switcher")!;
  switcher.append(icon("chevron"));
  const navigation = sidebar.querySelector<HTMLElement>("#units")!;
  const message = sidebar.querySelector<HTMLParagraphElement>(".au-list-message")!;
  const links = new Map<string, HTMLAnchorElement>();
  let count = 0;

  create.addEventListener("click", options.onCreate);
  importButton.addEventListener("click", options.onImport);
  switcher.addEventListener("click", toggle);
  navigation.addEventListener("click", collapse);

  function toggle() {
    const expanded = switcher.getAttribute("aria-expanded") !== "true";
    switcher.setAttribute("aria-expanded", String(expanded));
    sidebar.dataset.expanded = String(expanded);
  }

  function collapse(event: MouseEvent) {
    if (!(event.target instanceof Element) || !event.target.closest("a")) return;
    switcher.setAttribute("aria-expanded", "false");
    sidebar.dataset.expanded = "false";
  }

  return {
    render(units: readonly UnitSummary[], selectedId: string | undefined) {
      count = units.length;
      const ids = new Set(units.map(unit => unit.unitId));
      for (const [id, link] of links) {
        if (!ids.has(id)) {
          link.remove();
          links.delete(id);
        }
      }
      units.forEach((unit, index) => {
        let link = links.get(unit.unitId);
        if (!link) {
          link = document.createElement("a");
          link.className = "au-unit-link";
          const copy = document.createElement("span");
          copy.className = "au-unit-copy";
          const name = document.createElement("span");
          name.className = "au-unit-name";
          const meta = document.createElement("span");
          meta.className = "au-unit-meta";
          copy.append(name, meta);
          link.append(unitIcon(unit.type), copy);
          links.set(unit.unitId, link);
        }
        link.href = unitLink(unit.unitId, unit.type);
        link.title = unit.name;
        const label = UNIT_TYPES.find(item => item.type === unit.type)?.label ?? "Unit";
        const origin = unit.origin === "import" ? " · Imported" : unit.origin === "attachment" ? " · Converted" : "";
        const name = link.querySelector(".au-unit-name")!;
        const meta = link.querySelector(".au-unit-meta")!;
        if (name.textContent !== unit.name) name.textContent = unit.name;
        if (meta.textContent !== label + origin) meta.textContent = label + origin;
        if (unit.unitId === selectedId) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
        // Retain existing links when polling so keyboard focus and scroll position stay put.
        if (navigation.children[index] !== link) navigation.insertBefore(link, navigation.children[index] ?? null);
      });
      sidebar.querySelectorAll(".au-unit-count").forEach(element => { element.textContent = String(count); });
      message.textContent = "No units yet. Create or import one to get started.";
      message.hidden = count !== 0;
      navigation.removeAttribute("aria-busy");
    },
    setLoading(loading: boolean) {
      navigation.setAttribute("aria-busy", String(loading));
      if (count === 0 && loading) {
        message.hidden = false;
        message.textContent = "Loading units…";
      }
    },
    dispose() {
      create.removeEventListener("click", options.onCreate);
      importButton.removeEventListener("click", options.onImport);
      switcher.removeEventListener("click", toggle);
      navigation.removeEventListener("click", collapse);
      links.clear();
    },
  };
}
