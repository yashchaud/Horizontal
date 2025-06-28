import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@ui/button";
import styled from "styled-components";
import Profilephoto from "@/components/userprofile/profilephoto";
import { useDispatch, useSelector } from "react-redux";
import {
  setScrollToMessageId,
  setsearchresult,
  setToggleSearchBar,
} from "@/Redux/sessionSlice";
import PaginationComponent from "./Pagination";
import cross from "@/components/images/X.svg";

// Function to group messages by channel
const groupByChannel = (messages) => {
  return messages.reduce((acc, message) => {
    const channelId = message?.channel?._id;
    if (!acc[channelId]) {
      acc[channelId] = [];
    }
    acc[channelId].push(message);
    return acc;
  }, {});
};

const SearchResults = () => {
  const { searchresult } = useSelector((state) => state.counterSlice);
  const dispatch = useDispatch();
  const [currentPage, setCurrentPage] = useState(1);
  const messagesPerPage = 10;

  useEffect(() => {
    console.log("INSIDE", searchresult);
  }, [searchresult]);

  // Group messages by channel using useMemo for memoization
  const groupedMessages = useMemo(
    () => groupByChannel(searchresult),
    [searchresult]
  );

  // Calculate pagination values
  const indexOfLastMessage = currentPage * messagesPerPage;
  const indexOfFirstMessage = indexOfLastMessage - messagesPerPage;

  return (
    <div className="pl-[1px] min-w-[400px] max-w-[700px] min-h-[200px] relative z-[1233333213213211231232131231231221312312312312323123123] bg-[#1e1f22] text-white outline-none border-none placeholder:text-muted-foreground placeholder:text-[#b5bac1] z-[21333333332123]">
      <div className="min-h-full flex flex-col items-start pr-2 pl-2 bg-[#2b2d31] text-white outline-none border-none placeholder:text-muted-foreground placeholder:text-[#b5bac1] z-[21333333332123]">
        <div className="flex justify-between items-center pr-2 pl-2 w-full">
          <div>
            <h3>{`${searchresult.length} Results`}</h3>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="ghost"
              className="hover:bg-[#313338] hover:text-white"
            >
              New
            </Button>
            <Button
              variant="outline"
              className="hover:bg-[#313338] hover:text-white bg-[#2b2d31] text-white outline-none border-none placeholder:text-muted-foreground placeholder:text-[#b5bac1] z-[21333333332123]"
              onClick={() => {
                dispatch(setsearchresult([]));
                dispatch(setToggleSearchBar(false));
              }}
            >
              <img src={cross} alt="" />
            </Button>
          </div>
        </div>
        <div className="w-full flex flex-col gap-2 bg-[#2b2d31] text-white outline-none border-none placeholder:text-muted-foreground placeholder:text-[#b5bac1] z-[21333333332123]">
          {Object.keys(groupedMessages).map((channelId) => (
            <div key={channelId}>
              <div className="flex justify-center items-start gap-2 text-md">
                <p>{`#${groupedMessages[channelId][0]?.channel?.channelName}`}</p>
              </div>
              {groupedMessages[channelId]
                .slice(indexOfFirstMessage, indexOfLastMessage)
                .map((data, index) => (
                  <div
                    key={index}
                    className="p-3 mt-2 rounded-md w-full p-2 flex justify-between items-center gap-2 bg-[#313338] text-white outline-none border-none placeholder:text-muted-foreground placeholder:text-[#b5bac1] z-[21333333332123]"
                  >
                    <div className="w-full flex items-center gap-2">
                      <div className="w-10 flex items-center gap-2">
                        <Profilephoto />
                      </div>
                      <div className="flex flex-col items-start ">
                        <p className="text-sm">{data?.user?.username}</p>
                        <p className="text-sm">{data?.content}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      className=" text-white self-end w-12 h-8 -translate-y-4 flex items-center justify-center"
                      onClick={() => dispatch(setScrollToMessageId(data._id))}
                    >
                      jump
                    </Button>
                  </div>
                ))}
            </div>
          ))}
          <PaginationComponent
            totalMessages={searchresult.length}
            messagesPerPage={messagesPerPage}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
          />
        </div>
      </div>
    </div>
  );
};

export default SearchResults;
