"use client";

import { useEffect } from "react";

/* Ports the landing page's vanilla interactions (Landing Page.html <script> +
   borderglow.js). Returns null; attaches listeners to the server-rendered DOM. */
export default function LandingChrome() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    /* navbar: flat at top, glass island on scroll */
    const navbar = document.getElementById("navbar");
    if (navbar) {
      const onScroll = () => navbar.classList.toggle("float", window.scrollY > 40);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      cleanups.push(() => window.removeEventListener("scroll", onScroll));
    }

    /* product mockup: scroll-driven 3D tilt that flattens as it enters view */
    const product = document.getElementById("product");
    const showFrame = document.getElementById("showcaseFrame");
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const enableTilt = !!showFrame && !reduce && window.matchMedia && window.matchMedia("(min-width: 768px)").matches;
    if (enableTilt && product && showFrame) {
      let ticking = false;
      const tiltMax = 24;
      const updateTilt = () => {
        ticking = false;
        const r = product.getBoundingClientRect();
        const vh = window.innerHeight || 800;
        let p = (vh - r.top) / (vh * 0.8);
        p = Math.max(0, Math.min(1, p));
        showFrame.style.setProperty("--tilt", ((1 - p) * tiltMax).toFixed(2) + "deg");
      };
      const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(updateTilt); } };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", updateTilt, { passive: true });
      updateTilt();
      cleanups.push(() => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", updateTilt); });
    } else if (showFrame) {
      showFrame.style.setProperty("--tilt", "0deg");
    }

    /* mobile menu */
    const navBurger = document.getElementById("navBurger");
    const mobileMenu = document.getElementById("mobileMenu");
    const mmClose = document.getElementById("mmClose");
    if (navBurger && mobileMenu && mmClose) {
      const setMenu = (open: boolean) => {
        mobileMenu.classList.toggle("open", open);
        document.body.classList.toggle("menu-open", open);
        mobileMenu.setAttribute("aria-hidden", open ? "false" : "true");
        navBurger.setAttribute("aria-expanded", open ? "true" : "false");
      };
      const openMenu = () => setMenu(true);
      const closeMenu = () => setMenu(false);
      navBurger.addEventListener("click", openMenu);
      mmClose.addEventListener("click", closeMenu);
      const linkEls = Array.from(mobileMenu.querySelectorAll("a"));
      linkEls.forEach((a) => a.addEventListener("click", closeMenu));
      const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
      window.addEventListener("keydown", onEsc);
      const mqUp = window.matchMedia("(min-width: 881px)");
      const onMq = (e: MediaQueryListEvent) => { if (e.matches) setMenu(false); };
      mqUp.addEventListener("change", onMq);
      cleanups.push(() => {
        navBurger.removeEventListener("click", openMenu);
        mmClose.removeEventListener("click", closeMenu);
        linkEls.forEach((a) => a.removeEventListener("click", closeMenu));
        window.removeEventListener("keydown", onEsc);
        mqUp.removeEventListener("change", onMq);
      });
    }

    /* pricing: monthly / annual billing toggle */
    const pricing = document.getElementById("pricing");
    const billM = document.getElementById("billMonthly");
    const billA = document.getElementById("billAnnual");
    if (pricing && billM && billA) {
      const setBilling = (mode: "monthly" | "annual") => {
        pricing.setAttribute("data-billing", mode);
        billA.classList.toggle("on", mode === "annual");
        billM.classList.toggle("on", mode === "monthly");
      };
      const toM = () => setBilling("monthly");
      const toA = () => setBilling("annual");
      billM.addEventListener("click", toM);
      billA.addEventListener("click", toA);
      cleanups.push(() => { billM.removeEventListener("click", toM); billA.removeEventListener("click", toA); });
    }

    /* FAQ accordion */
    const faqItems = Array.from(document.querySelectorAll<HTMLElement>(".faq-item"));
    const faqHandlers: Array<{ q: Element; h: () => void }> = [];
    faqItems.forEach((item) => {
      const q = item.querySelector(".faq-q");
      const a = item.querySelector<HTMLElement>(".faq-a");
      if (!q || !a) return;
      const h = () => {
        const isOpen = item.classList.contains("open");
        document.querySelectorAll<HTMLElement>(".faq-item.open").forEach((o) => {
          if (o !== item) { o.classList.remove("open"); const oa = o.querySelector<HTMLElement>(".faq-a"); if (oa) oa.style.maxHeight = ""; }
        });
        if (isOpen) { item.classList.remove("open"); a.style.maxHeight = ""; }
        else { item.classList.add("open"); a.style.maxHeight = a.scrollHeight + "px"; }
      };
      q.addEventListener("click", h);
      faqHandlers.push({ q, h });
    });
    cleanups.push(() => faqHandlers.forEach(({ q, h }) => q.removeEventListener("click", h)));

    /* contact form (demo submit) */
    const cForm = document.getElementById("contactForm") as HTMLFormElement | null;
    if (cForm) {
      const onSubmit = (e: Event) => {
        e.preventDefault();
        const name = (cForm.querySelector("#cf-name") as HTMLInputElement)?.value.trim();
        const email = (cForm.querySelector("#cf-email") as HTMLInputElement)?.value.trim();
        const msg = (cForm.querySelector("#cf-msg") as HTMLTextAreaElement)?.value.trim();
        if (!name || !email || !msg) {
          cForm.querySelectorAll<HTMLElement>(".cf-input").forEach((i) => {
            if (!(i as HTMLInputElement).value.trim()) i.style.borderColor = "rgba(194,67,56,.7)";
          });
          return;
        }
        cForm.classList.add("sent");
      };
      cForm.addEventListener("submit", onSubmit);
      const inputs = Array.from(cForm.querySelectorAll<HTMLElement>(".cf-input"));
      const onInput = (e: Event) => { (e.target as HTMLElement).style.borderColor = ""; };
      inputs.forEach((i) => i.addEventListener("input", onInput));
      cleanups.push(() => {
        cForm.removeEventListener("submit", onSubmit);
        inputs.forEach((i) => i.removeEventListener("input", onInput));
      });
    }

    /* smooth scroll for in-page anchors */
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    const onAnchor = (e: Event) => {
      const a = e.currentTarget as HTMLAnchorElement;
      const id = a.getAttribute("href")!.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (el) { e.preventDefault(); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" }); }
    };
    anchors.forEach((a) => a.addEventListener("click", onAnchor));
    cleanups.push(() => anchors.forEach((a) => a.removeEventListener("click", onAnchor)));

    /* border-glow: pointer-driven edge glow on .bg-card (skip touch) */
    if (!window.matchMedia || window.matchMedia("(pointer: fine)").matches) {
      const center = (el: HTMLElement): [number, number] => { const r = el.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
      const edgeProximity = (el: HTMLElement, x: number, y: number) => {
        const [cx, cy] = center(el);
        const dx = x - cx, dy = y - cy;
        let kx = Infinity, ky = Infinity;
        if (dx !== 0) kx = cx / Math.abs(dx);
        if (dy !== 0) ky = cy / Math.abs(dy);
        return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
      };
      const cursorAngle = (el: HTMLElement, x: number, y: number) => {
        const [cx, cy] = center(el);
        const dx = x - cx, dy = y - cy;
        if (dx === 0 && dy === 0) return 0;
        let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (deg < 0) deg += 360;
        return deg;
      };
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".bg-card"));
      const handlers: Array<{ card: HTMLElement; h: (e: PointerEvent) => void }> = [];
      cards.forEach((card) => {
        const h = (e: PointerEvent) => {
          const r = card.getBoundingClientRect();
          const x = e.clientX - r.left, y = e.clientY - r.top;
          card.style.setProperty("--edge-proximity", (edgeProximity(card, x, y) * 100).toFixed(2));
          card.style.setProperty("--cursor-angle", cursorAngle(card, x, y).toFixed(2) + "deg");
        };
        card.addEventListener("pointermove", h, { passive: true });
        handlers.push({ card, h });
      });
      cleanups.push(() => handlers.forEach(({ card, h }) => card.removeEventListener("pointermove", h)));
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
