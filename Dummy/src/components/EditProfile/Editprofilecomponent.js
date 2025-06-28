import React, { useState } from "react";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { CreditCard, Lock, Settings, User, CircleX } from "lucide-react";

const Editprofilecomponent = () => {
  return (
    <div className="w-full bg-[#313338] p-12 h-full">
      <div className="mt-4 flex justify-between">
        <Label className="text-white font-bold text-xl ">My Account</Label>
        <Button
          onClick={() => {
            window.history.back();
          }}
          variant="ghost"
        >
          <CircleX />
        </Button>
      </div>
      <div className="space-y-6 max-w-[50rem]  p-6 text-white bg-[#2b2d31] rounded-lg mt-6 ml-2">
        <div>
          <h2 className="text-2xl font-bold">Edit Profile</h2>
          <p className="text-muted-foreground">
            Update your personal information
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20">
              <AvatarImage
                src="/placeholder-avatar.jpg"
                alt="Profile picture"
              />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <Button className="bg-[#5865f2] text-white">Change Avatar</Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" placeholder="John Doe" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="john@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" placeholder="Tell us about yourself" />
          </div>
          <Button>Save Changes</Button>
        </div>
      </div>
    </div>
  );
};

export default Editprofilecomponent;
