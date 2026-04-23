import React from "react";
import { motion, type Variants } from "framer-motion";

/**
 * AnimatedList — Magic UI staggered list/grid container.
 * Wraps children in a motion container that staggers their entrance.
 */
interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  as?: "div" | "ul" | "ol";
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

const AnimatedList: React.FC<AnimatedListProps> & {
  Item: typeof AnimatedListItem;
} = ({ children, className, stagger }) => {
  const variants = stagger
    ? {
        ...containerVariants,
        show: {
          opacity: 1,
          transition: { staggerChildren: stagger },
        },
      }
    : containerVariants;

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
};

const AnimatedListItem: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <motion.div variants={itemVariants} className={className}>
    {children}
  </motion.div>
);

AnimatedList.Item = AnimatedListItem;

export { AnimatedList, AnimatedListItem };
