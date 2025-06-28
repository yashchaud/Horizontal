import React from "react";
import Top from "./Top";
import Buttonsection from "./Buttonsection";
import styled from "styled-components";
import DirectMessage from "./DirectMessage";
import { Outlet } from "react-router-dom";
import Statusdivbottom from "@/components/channels/Statusdivbottom";
const Searchtabtop = () => {
  return (
    <Flex>
      <Cover className="flex flex-col relative">
        <Top />
        <Buttonsection />
        <DirectMessage />
        <Statusdivbottom />
      </Cover>
      <Outlet />
    </Flex>
  );
};

export default Searchtabtop;

const Flex = styled.div`
  display: flex;
`;
const Cover = styled.div`
  max-width: 15rem;
  min-width: 15rem;

  background-color: #2b2d31;
  @media (max-width: 1024px) {
    min-width: 92.9vw;
    display: flex;
    justify-content: start;
    overflow: hidden;
  }
  @media (max-width: 560px) {
    min-width: 86.5vw;
  }
  @media (max-width: 375px) {
    min-width: 80.5vw;
    padding-left: 0.5rem;
  }

  @media (max-width: 320px) {
    min-width: 77.5vw;
    padding-left: 0.5rem;
  }
`;
