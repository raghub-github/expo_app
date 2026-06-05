const MAPBIKE_SRC = '/mapbike.png';

const TEARDROP_PIN_SVG = `<svg class="gm-teardrop-pin__shape" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 0C8.82 0 3 5.58 3 12.46c0 8.12 11.11 20.9 12.28 22.22a1.2 1.2 0 0 0 1.44 0C17.89 33.36 29 20.58 29 12.46 29 5.58 23.18 0 16 0z"/></svg>`;

const STORE_BUILDING_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>`;

function appendTeardropPin(pin: HTMLDivElement) {
  pin.classList.add('gm-location-marker__pin--teardrop');
  const wrap = document.createElement('div');
  wrap.className = 'gm-teardrop-pin';
  wrap.innerHTML = TEARDROP_PIN_SVG;
  const icon = document.createElement('div');
  icon.className = 'gm-teardrop-pin__icon gm-teardrop-pin__icon--store';
  icon.innerHTML = STORE_BUILDING_SVG;
  wrap.appendChild(icon);
  pin.appendChild(wrap);
}

export function createMerchantStoreMarkerElement(storeName?: string | null): HTMLDivElement {
  const displayName = storeName?.trim();
  const root = document.createElement('div');
  root.className = 'gm-location-marker gm-location-marker--store';

  const chip = document.createElement('div');
  chip.className = 'gm-location-marker__chip';

  const chipHeader = document.createElement('div');
  chipHeader.className = 'gm-location-marker__chip-header';

  const badge = document.createElement('span');
  badge.className = 'gm-location-marker__badge';
  badge.textContent = 'Store Location';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'gm-location-marker__close';
  closeBtn.setAttribute('aria-label', 'Hide store label');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    root.classList.remove('gm-location-marker--label-open');
  });

  chipHeader.append(badge, closeBtn);
  chip.appendChild(chipHeader);

  if (displayName) {
    const nameEl = document.createElement('span');
    nameEl.className = 'gm-location-marker__name';
    nameEl.textContent = displayName;
    chip.appendChild(nameEl);
  }

  const pin = document.createElement('div');
  pin.className = 'gm-location-marker__pin';
  pin.setAttribute('role', 'button');
  pin.setAttribute('tabindex', '0');
  pin.setAttribute('aria-label', 'Show store location label');
  appendTeardropPin(pin);

  const openLabel = () => root.classList.add('gm-location-marker--label-open');
  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    openLabel();
  });
  pin.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openLabel();
    }
  });

  root.append(chip, pin);
  return root;
}

export function createMerchantRiderMarkerElement(headingDeg?: number | null): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'gm-location-marker gm-location-marker--rider';

  const img = document.createElement('img');
  img.src = MAPBIKE_SRC;
  img.alt = 'Rider';
  img.className = 'gm-location-marker__bike';
  img.draggable = false;
  if (headingDeg != null && Number.isFinite(headingDeg)) {
    img.style.transform = `rotate(${headingDeg}deg)`;
  }

  root.appendChild(img);
  return root;
}

export function setMerchantRiderBikeHeading(
  marker: { getElement?: () => HTMLElement },
  headingDeg: number | null | undefined
) {
  if (headingDeg == null || !Number.isFinite(headingDeg)) return;
  const img = marker.getElement?.()?.querySelector('.gm-location-marker__bike') as HTMLElement | null;
  if (img) img.style.transform = `rotate(${headingDeg}deg)`;
}

/** Preserve label open state when map re-renders the store marker. */
export function isMerchantStoreLabelOpen(
  marker: { getElement?: () => HTMLElement } | null
): boolean {
  const el = marker?.getElement?.();
  return Boolean(el?.classList.contains('gm-location-marker--label-open'));
}

export function createMerchantStoreMarkerElementWithLabelState(
  storeName: string | null | undefined,
  labelOpen: boolean
): HTMLDivElement {
  const el = createMerchantStoreMarkerElement(storeName);
  if (labelOpen) el.classList.add('gm-location-marker--label-open');
  return el;
}
