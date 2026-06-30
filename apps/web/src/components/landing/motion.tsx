'use client';

import * as React from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

/**
 * Primitivos de animación del landing. Todos respetan prefers-reduced-motion:
 * cuando está activo, el contenido aparece estático (sin desplazamiento ni
 * opacidad animada).
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Revela al entrar al viewport: translateY 16→0, opacity 0→1, 500ms. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

/** Contenedor que escalona la entrada de sus hijos (80ms entre cada uno). */
export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

/** Hijo de <Stagger>. */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

/** Chevron al pie del hero que se desvanece tras hacer scroll. */
export function ScrollCue() {
  const reduce = useReducedMotion();
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setHidden(window.scrollY > 120);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none flex justify-center transition-opacity duration-500"
      style={{ opacity: hidden ? 0 : 1 }}
    >
      <ChevronDown
        className={`size-6 text-text-muted ${reduce || hidden ? '' : 'animate-bounce'}`}
      />
    </div>
  );
}
