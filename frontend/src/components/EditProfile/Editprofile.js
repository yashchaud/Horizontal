import { useState } from "react";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { CreditCard, Lock, Settings, User } from "lucide-react";
import ProfileSection from "./Editprofilecomponent";

export default function Component() {
  const [activeTab, setActiveTab] = useState("profile");

  const sidebarItems = [
    { id: "profile", label: "Profile", icon: User },
    // { id: "account", label: "Account", icon: Settings },
    // { id: "security", label: "Security", icon: Lock },
    // { id: "billing", label: "Billing", icon: CreditCard },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "profile":
        return <ProfileSection />;
      case "account":
        return (
          <div>
            <h2 className="text-2xl font-bold">Account Settings</h2>
          </div>
        );
      case "security":
        return (
          <div>
            <h2 className="text-2xl font-bold">Security Settings</h2>
          </div>
        );
      case "billing":
        return (
          <div>
            <h2 className="text-2xl font-bold">Billing Information</h2>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen min-w-[100vw] text-white">
      <aside className="w-64 bg-[#2b2d31] p-6">
        <h1 className="mb-6 text-2xl font-bold">Settings</h1>
        <nav className="space-y-2 sticky">
          {sidebarItems.map((item) => (
            <Button
              key={item.id}
              variant={activeTab === item.id ? "secondary" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab(item.id)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </Button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 bg-background  bg-[#313338]">
        {renderContent()}
      </main>
    </div>
  );
}
