"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import BackgroundBox from "@/components/shared/BackgroundBox";
import Button from "@/components/shared/Button";
import { LocalStorageKeyEnum, RouteEnum } from "@/lib/enums";

export default function HomePage() {
  const router = useRouter();

  const handleTestMode = () => {
    localStorage.setItem(LocalStorageKeyEnum.TEST_MODE, "true");
    router.push(RouteEnum.CREATE_ROOM);
  };

  const handleCreateRoom = () => {
    localStorage.removeItem(LocalStorageKeyEnum.TEST_MODE);
  };

  return (
    <BackgroundBox src="/images/bg_home.jpg" className="flex justify-center items-center w-full h-screen">
      <div className="flex flex-col items-center justify-center gap-12">
        <Image
          alt="logo"
          src="/images/logo.png"
          width={320}
          height={320}
          priority
          className="w-80 anim-slide-to-bottom"
        />
        <div className="flex flex-col gap-6 w-80">
          <Link href={RouteEnum.CREATE_ROOM} onClick={handleCreateRoom}>
            <Button className="w-full px-8 py-4 anim-slide-to-top">Create Room</Button>
          </Link>
          <Link href={RouteEnum.JOIN_ROOM}>
            <Button className="w-full px-8 py-4 anim-slide-to-top">Join Room</Button>
          </Link>
          <Button
            className="w-full px-8 py-4 anim-slide-to-top !bg-purple-800 hover:!bg-purple-700 border-purple-500"
            onClick={handleTestMode}
          >
            🤖 Test Mode
          </Button>
        </div>
      </div>
    </BackgroundBox>
  );
}
