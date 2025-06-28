import React, { useEffect, useState } from "react";
import Chatnavbar from "@components/chats/chatnavbar";
import Chatsection from "@components/chats/Chatsection";
import styled from "styled-components";
import Searcharea from "@components/chats/threads/Threadsearch";
import Threadcreate from "@components/chats/threads/Threadcreate";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import axios from "axios";
import Mainview from "@/components/Videocalling/Mainview";
import MembersTab from "@/components/chats/MembersTab";
import Swipeable from "../components/Helpers/Swipeable";
import SearchResults from "@/components/Searchpart/SearchResults";
import { setsearchresult } from "@/Redux/sessionSlice";
import { useDispatch } from "react-redux";
const Chatpage = () => {
  const { createThread } = useSelector((state) => state.counterSlice);
  const { id, channelId } = useParams();
  const [channeltype, setchanneltype] = useState();
  const { togglesidebar, toggleMemberstab } = useSelector(
    (state) => state.counterSlice
  );
  const { toggleSearchBar } = useSelector((state) => state.counterSlice);
  const dispatch = useDispatch();
  useEffect(() => {
    console.log(channelId);
    axios
      .get(`/api/channel/channelfind/${channelId}`)
      .then((res) => {
        if (res.data.channelType === "voice") {
          setchanneltype("voice");
        } else {
          setchanneltype("text");
        }
      })
      .catch((err) => {
        console.log(err);
      });
    console.log(channeltype);
  }, [channelId]);

  return (
    <>
      {togglesidebar && <Spacer />}
      {channeltype === "text" && (
        <Cover>
          <Chatnavbar />
          <div className="flex  w-full max-h-[95%] relative">
            <div className=" flex flex-col w-full overflow-hidden mr-[0.5px]">
              <Chatsection />
              <Searcharea />
            </div>
            {toggleMemberstab && <MembersTab />}
            {toggleSearchBar && <SearchResults />}
          </div>
        </Cover>
      )}

      {channeltype === "voice" && <Mainview />}

      {createThread && <Threadcreate />}
    </>
  );
};

export default Chatpage;
const Cover = styled.div`
  width: 100%;
  min-height: 100vh;
  max-height: 100vh;
  position: relative;
  display: flex;
  flex-direction: column;
  @media (max-width: 1024px) {
    max-width: 100vw;
    max-width: 100vw;
    overflow: hidden;
  }
`;
const Spacer = styled.div`
  /* @media (max-width: 768px) {
    width: 7.5rem;
  }

  @media (max-width: 520px) {
    width: 8.5;
  }

  @media (max-width: 425px) {
    width: 15rem;
  }
  @media (max-width: 375px) {
    width: 25rem;
  } */
`;
