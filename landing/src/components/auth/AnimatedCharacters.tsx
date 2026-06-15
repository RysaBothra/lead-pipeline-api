import { useState, useEffect, useRef } from "react";

// ============================================
// Pupil Component - Eyes without white background
// ============================================
interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}

const Pupil = ({
  size = 12,
  maxDistance = 5,
  pupilColor = "black",
  forceLookX,
  forceLookY,
}: PupilProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const calculatePupilPosition = () => {
    if (!pupilRef.current) return { x: 0, y: 0 };

    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }

    const pupil = pupilRef.current.getBoundingClientRect();
    const pupilCenterX = pupil.left + pupil.width / 2;
    const pupilCenterY = pupil.top + pupil.height / 2;

    const deltaX = mouseX - pupilCenterX;
    const deltaY = mouseY - pupilCenterY;
    const distance = Math.min(
      Math.sqrt(deltaX ** 2 + deltaY ** 2),
      maxDistance
    );

    const angle = Math.atan2(deltaY, deltaX);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    return { x, y };
  };

  const pupilPosition = calculatePupilPosition();

  return (
    <div
      ref={pupilRef}
      className="rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
        transition: "transform 0.1s ease-out",
      }}
    />
  );
};

// ============================================
// EyeBall Component - Full eyeball with blinking
// ============================================
interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

const EyeBall = ({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = "white",
  pupilColor = "black",
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) => {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const calculatePupilPosition = () => {
    if (!eyeRef.current) return { x: 0, y: 0 };

    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }

    const eye = eyeRef.current.getBoundingClientRect();
    const eyeCenterX = eye.left + eye.width / 2;
    const eyeCenterY = eye.top + eye.height / 2;

    const deltaX = mouseX - eyeCenterX;
    const deltaY = mouseY - eyeCenterY;
    const distance = Math.min(
      Math.sqrt(deltaX ** 2 + deltaY ** 2),
      maxDistance
    );

    const angle = Math.atan2(deltaY, deltaX);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    return { x, y };
  };

  const pupilPosition = calculatePupilPosition();

  return (
    <div
      ref={eyeRef}
      className="rounded-full flex items-center justify-center transition-all duration-150"
      style={{
        width: `${size}px`,
        height: isBlinking ? "2px" : `${size}px`,
        backgroundColor: eyeColor,
        overflow: "hidden",
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
            transition: "transform 0.1s ease-out",
          }}
        />
      )}
    </div>
  );
};

// ============================================
// Main AnimatedCharacters Component
// ============================================
interface AnimatedCharactersProps {
  isTyping?: boolean;
  isTypingOtp?: boolean;
  loginResult?: "success" | "error" | null;
  customImage?: string | null;
}

export function AnimatedCharacters({
  isTyping = false,
  isTypingOtp = false,
  loginResult = null,
  customImage = null,
}: AnimatedCharactersProps) {
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);


  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isBlackBlinking, setIsBlackBlinking] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);

  // Mood states for dynamic expressions
  const [orangeMood, setOrangeMood] = useState<"happy" | "curious" | "excited">(
    "happy"
  );
  const [yellowMood, setYellowMood] = useState<
    "neutral" | "skeptical" | "amused"
  >("neutral");

  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Purple character blinking
  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;

    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsPurpleBlinking(true);
        setTimeout(() => {
          setIsPurpleBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());

      return blinkTimeout;
    };

    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  // Black character blinking
  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;

    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsBlackBlinking(true);
        setTimeout(() => {
          setIsBlackBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());

      return blinkTimeout;
    };

    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  // Characters look at each other when typing (phone/email)
  useEffect(() => {
    if (isTyping && !isTypingOtp) {
      setIsLookingAtEachOther(true);
      const timer = setTimeout(() => {
        setIsLookingAtEachOther(false);
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setIsLookingAtEachOther(false);
    }
  }, [isTyping, isTypingOtp]);

  // Purple character occasionally peeks when typing OTP
  useEffect(() => {
    if (isTypingOtp) {
      const schedulePeek = () => {
        const peekInterval = setTimeout(() => {
          setIsPurplePeeking(true);
          setTimeout(() => {
            setIsPurplePeeking(false);
          }, 800);
        }, Math.random() * 3000 + 2000);
        return peekInterval;
      };

      const firstPeek = schedulePeek();
      return () => clearTimeout(firstPeek);
    } else {
      setIsPurplePeeking(false);
    }
  }, [isTypingOtp, isPurplePeeking]);

  // Random mood changes for orange character
  useEffect(() => {
    const moods: ("happy" | "curious" | "excited")[] = [
      "happy",
      "curious",
      "excited",
    ];
    const changeMood = () => {
      const randomMood = moods[Math.floor(Math.random() * moods.length)];
      setOrangeMood(randomMood);
    };

    const interval = setInterval(changeMood, 4000 + Math.random() * 3000);
    return () => clearInterval(interval);
  }, []);

  // Random mood changes for yellow character
  useEffect(() => {
    const moods: ("neutral" | "skeptical" | "amused")[] = [
      "neutral",
      "skeptical",
      "amused",
    ];
    const changeMood = () => {
      const randomMood = moods[Math.floor(Math.random() * moods.length)];
      setYellowMood(randomMood);
    };

    const interval = setInterval(changeMood, 5000 + Math.random() * 4000);
    return () => clearInterval(interval);
  }, []);

  // Calculate body position and skew based on mouse
  const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;

    const deltaX = mouseX - centerX;
    const deltaY = mouseY - centerY;

    const faceX = Math.max(-15, Math.min(15, deltaX / 20));
    const faceY = Math.max(-10, Math.min(10, deltaY / 30));
    const bodySkew = Math.max(-6, Math.min(6, -deltaX / 120));

    return { faceX, faceY, bodySkew };
  };

  const purplePos = calculatePosition(purpleRef);
  const blackPos = calculatePosition(blackRef);
  const yellowPos = calculatePosition(yellowRef);
  const orangePos = calculatePosition(orangeRef);

  // If we have a custom image, render it with a subtle floating animation instead of the SVG characters
  if (customImage) {
    return (
      <div className="relative flex items-center justify-center" style={{ width: "550px", height: "400px" }}>
        <div className="animate-bounce-subtle pointer-events-none">
          <img
            src={customImage}
            alt="Custom Character"
            className="max-h-[400px] max-w-[500px] object-contain"
          />
        </div>
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes bounce-subtle {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-15px); }
          }
          .animate-bounce-subtle {
            animation: bounce-subtle 3s ease-in-out infinite;
          }
        `}} />
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: "550px", height: "400px" }}>
      {/* Purple tall rectangle character - Back layer */}
      <div
        ref={purpleRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: "70px",
          width: "180px",
          height: isTyping || isTypingOtp ? "440px" : "400px",
          backgroundColor: "#6C3FF5",
          borderRadius: "10px 10px 0 0",
          zIndex: 1,
          transform: isTypingOtp
            ? `skewX(0deg)`
            : isTyping
              ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(40px)`
              : `skewX(${purplePos.bodySkew || 0}deg)`,
          transformOrigin: "bottom center",
        }}
      >
        {/* Eyes */}
        <div
          className="absolute flex gap-8 transition-all duration-700 ease-in-out"
          style={{
            left: isTypingOtp
              ? `${20}px`
              : isLookingAtEachOther
                ? `${55}px`
                : `${45 + purplePos.faceX}px`,
            top: isTypingOtp
              ? `${35}px`
              : isLookingAtEachOther
                ? `${65}px`
                : `${40 + purplePos.faceY}px`,
          }}
        >
          <EyeBall
            size={18}
            pupilSize={7}
            maxDistance={5}
            eyeColor="white"
            pupilColor="#2D2D2D"
            isBlinking={isPurpleBlinking}
            forceLookX={
              isTypingOtp
                ? isPurplePeeking
                  ? 4
                  : -4
                : isLookingAtEachOther
                  ? 3
                  : undefined
            }
            forceLookY={
              isTypingOtp
                ? isPurplePeeking
                  ? 5
                  : -4
                : isLookingAtEachOther
                  ? 4
                  : undefined
            }
          />
          <EyeBall
            size={18}
            pupilSize={7}
            maxDistance={5}
            eyeColor="white"
            pupilColor="#2D2D2D"
            isBlinking={isPurpleBlinking}
            forceLookX={
              isTypingOtp
                ? isPurplePeeking
                  ? 4
                  : -4
                : isLookingAtEachOther
                  ? 3
                  : undefined
            }
            forceLookY={
              isTypingOtp
                ? isPurplePeeking
                  ? 5
                  : -4
                : isLookingAtEachOther
                  ? 4
                  : undefined
            }
          />
        </div>
        {/* Purple character mouth */}
        <svg
          className="absolute transition-all duration-300 ease-out"
          width="40"
          height="20"
          viewBox="0 0 40 20"
          style={{
            left: `${70 + purplePos.faceX}px`,
            top: `${80 + purplePos.faceY}px`,
          }}
        >
          <path
            d={
              loginResult === "error"
                ? "M5 5 Q20 0 35 5"
                : loginResult === "success"
                  ? "M5 5 Q20 18 35 5"
                  : isTypingOtp
                    ? "M8 8 Q20 4 32 8"
                    : isTyping
                      ? "M10 8 Q20 12 30 8"
                      : "M8 10 Q20 14 32 10"
            }
            stroke="white"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
      </div>

      {/* Black tall rectangle character - Middle layer */}
      <div
        ref={blackRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: "240px",
          width: "120px",
          height: "310px",
          backgroundColor: "#2D2D2D",
          borderRadius: "8px 8px 0 0",
          zIndex: 2,
          transform: isTypingOtp
            ? `skewX(0deg)`
            : isLookingAtEachOther
              ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10
              }deg) translateX(20px)`
              : isTyping
                ? `skewX(${(blackPos.bodySkew || 0) * 1.5}deg)`
                : `skewX(${blackPos.bodySkew || 0}deg)`,
          transformOrigin: "bottom center",
        }}
      >
        {/* Eyes */}
        <div
          className="absolute flex gap-6 transition-all duration-700 ease-in-out"
          style={{
            left: isTypingOtp
              ? `${10}px`
              : isLookingAtEachOther
                ? `${32}px`
                : `${26 + blackPos.faceX}px`,
            top: isTypingOtp
              ? `${28}px`
              : isLookingAtEachOther
                ? `${12}px`
                : `${32 + blackPos.faceY}px`,
          }}
        >
          <EyeBall
            size={16}
            pupilSize={6}
            maxDistance={4}
            eyeColor="white"
            pupilColor="#2D2D2D"
            isBlinking={isBlackBlinking}
            forceLookX={isTypingOtp ? -4 : isLookingAtEachOther ? 0 : undefined}
            forceLookY={
              isTypingOtp ? -4 : isLookingAtEachOther ? -4 : undefined
            }
          />
          <EyeBall
            size={16}
            pupilSize={6}
            maxDistance={4}
            eyeColor="white"
            pupilColor="#2D2D2D"
            isBlinking={isBlackBlinking}
            forceLookX={isTypingOtp ? -4 : isLookingAtEachOther ? 0 : undefined}
            forceLookY={
              isTypingOtp ? -4 : isLookingAtEachOther ? -4 : undefined
            }
          />
        </div>
        {/* Black character mouth */}
        <svg
          className="absolute transition-all duration-300 ease-out"
          width="30"
          height="15"
          viewBox="0 0 30 15"
          style={{
            left: `${45 + blackPos.faceX}px`,
            top: `${70 + blackPos.faceY}px`,
          }}
        >
          <path
            d={
              loginResult === "error"
                ? "M3 4 Q15 0 27 4"
                : loginResult === "success"
                  ? "M3 4 Q15 14 27 4"
                  : isTypingOtp
                    ? "M5 6 Q15 3 25 6"
                    : isTyping
                      ? "M5 6 Q15 10 25 6"
                      : "M5 7 Q15 11 25 7"
            }
            stroke="white"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
      </div>

      {/* Orange semi-circle character - Front left */}
      <div
        ref={orangeRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: "0px",
          width: "240px",
          height: "200px",
          zIndex: 3,
          backgroundColor: "#FF9B6B",
          borderRadius: "120px 120px 0 0",
          transform: isTypingOtp
            ? `skewX(0deg)`
            : `skewX(${orangePos.bodySkew || 0}deg)`,
          transformOrigin: "bottom center",
        }}
      >
        {/* Eyes - just pupils, no white */}
        <div
          className="absolute flex gap-8 transition-all duration-200 ease-out"
          style={{
            left: isTypingOtp ? `${50}px` : `${82 + (orangePos.faceX || 0)}px`,
            top: isTypingOtp ? `${85}px` : `${90 + (orangePos.faceY || 0)}px`,
          }}
        >
          <Pupil
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={isTypingOtp ? -5 : undefined}
            forceLookY={isTypingOtp ? -4 : undefined}
          />
          <Pupil
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={isTypingOtp ? -5 : undefined}
            forceLookY={isTypingOtp ? -4 : undefined}
          />
        </div>
        {/* Orange character mouth */}
        <svg
          className="absolute transition-all duration-300 ease-out"
          width="50"
          height="25"
          viewBox="0 0 50 25"
          style={{
            left: `${95 + (orangePos.faceX || 0)}px`,
            top: `${130 + (orangePos.faceY || 0)}px`,
          }}
        >
          <path
            d={
              loginResult === "error"
                ? "M5 8 Q25 0 45 8"
                : loginResult === "success"
                  ? "M5 6 Q25 22 45 6"
                  : isTypingOtp
                    ? "M10 10 Q25 6 40 10"
                    : isTyping
                      ? "M8 10 Q25 16 42 10"
                      : orangeMood === "excited"
                        ? "M5 8 Q25 20 45 8"
                        : orangeMood === "curious"
                          ? "M10 10 Q25 14 40 10"
                          : "M8 10 Q25 18 42 10"
            }
            stroke="#2D2D2D"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
      </div>

      {/* Yellow tall rectangle character - Front right */}
      <div
        ref={yellowRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: "310px",
          width: "140px",
          height: "230px",
          backgroundColor: "#E8D754",
          borderRadius: "70px 70px 0 0",
          zIndex: 4,
          transform: isTypingOtp
            ? `skewX(0deg)`
            : `skewX(${yellowPos.bodySkew || 0}deg)`,
          transformOrigin: "bottom center",
        }}
      >
        {/* Eyes - just pupils, no white */}
        <div
          className="absolute flex gap-6 transition-all duration-200 ease-out"
          style={{
            left: isTypingOtp ? `${20}px` : `${52 + (yellowPos.faceX || 0)}px`,
            top: isTypingOtp ? `${35}px` : `${40 + (yellowPos.faceY || 0)}px`,
          }}
        >
          <Pupil
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={isTypingOtp ? -5 : undefined}
            forceLookY={isTypingOtp ? -4 : undefined}
          />
          <Pupil
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={isTypingOtp ? -5 : undefined}
            forceLookY={isTypingOtp ? -4 : undefined}
          />
        </div>
        {/* Yellow character mouth */}
        <svg
          className="absolute transition-all duration-300 ease-out"
          width="50"
          height="25"
          viewBox="0 0 50 25"
          style={{
            left: `${45 + (yellowPos.faceX || 0)}px`,
            top: `${80 + (yellowPos.faceY || 0)}px`,
          }}
        >
          <path
            d={
              loginResult === "error"
                ? "M5 8 Q25 2 45 8"
                : loginResult === "success"
                  ? "M5 8 Q25 20 45 8"
                  : isTypingOtp
                    ? "M8 10 Q25 6 42 10"
                    : isTyping
                      ? "M10 10 Q25 14 40 10"
                      : yellowMood === "amused"
                        ? "M10 10 Q25 16 40 10"
                        : yellowMood === "skeptical"
                          ? "M5 12 Q25 10 45 12"
                          : "M8 12 Q25 12 42 12"
            }
            stroke="#2D2D2D"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
      </div>
    </div>
  );
}
