import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * TextGenerate — Aceternity-style word-by-word text reveal animation.
 */
interface TextGenerateProps {
  words: string;
  className?: string;
  duration?: number;
}

const TextGenerate: React.FC<TextGenerateProps> = ({
  words,
  className,
  duration = 0.5,
}) => {
  const wordArray = words.split(" ");
  return (
    <span className={cn("inline", className)}>
      {wordArray.map((word, idx) => (
        <motion.span
          key={`${word}-${idx}`}
          initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: duration,
            delay: idx * 0.08,
            ease: "easeOut",
          }}
          className="mr-1.5 inline-block"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
};

export default TextGenerate;
