import React from "react";
import styled from "styled-components";
import Serverbar from "@/components/servers/Serverbar";
import Messages from "@/components/Mobilemessages/Messages";

const MobilePAge = () => {
  return (
    <div className="flex w-[100%]">
      <Serverbar />
      <Messages />
    </div>
  );
};

export default MobilePAge;
