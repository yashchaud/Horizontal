import React, { useState, useEffect } from "react";
import Serverbar from "@components/servers/Serverbar";
import Searchtabtop from "@components/Users/friendtab/Searchtabtop";
import styled from "styled-components";
import Navfriend from "@components/Users/Friendonlinepart/Comboonline";
import { useSelector } from "react-redux";
import { current } from "@reduxjs/toolkit";

const Useronlinepage = () => {
  const { FriendTabFlag } = useSelector((state) => state.counterSlice);
  const [currentWidth, setCurrentwidth] = useState(window.innerWidth);

  useEffect(() => {
    setCurrentwidth(window.innerWidth);
  }, [currentWidth, window.innerWidth]);

  return (
    <Cover>
      <Serverbar />
      {!FriendTabFlag && <Searchtabtop />}
      {currentWidth > 1024 ? <Navfriend /> : FriendTabFlag && <Navfriend />}
    </Cover>
  );
};

export default Useronlinepage;

const Cover = styled.div`
  display: flex;
`;
