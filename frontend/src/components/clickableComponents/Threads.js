import React, { useState } from "react";
import Threadsimg from "../../components/images/Threads.svg";
import plus from "../../components/images/Plus.svg";
import search from "../../components/images/search.svg";
import { setThreads, setcreateThread } from "../../Redux/sessionSlice";
import { useDispatch, useSelector } from "react-redux";
import { Popover, PopoverTrigger, PopoverContent } from "@ui/popover";
import styled from "styled-components";
const Threads = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dispatch = useDispatch();
  const { createThread } = useSelector((state) => state.counterSlice);

  const handleSubmit = () => {
    dispatch(setcreateThread(true));
    dispatch(setThreads(false));
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="p-2 bg-gray-700 text-white rounded-md"
          onClick={() => setIsOpen(!isOpen)}
        >
          <img src={Threadsimg} alt="Threads" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 p-4 bg-gray-800 text-white rounded-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <img src={Threadsimg} alt="Threads" className="w-6 h-6" />
          <p className="text-lg font-semibold">Threads</p>
        </div>
        <div className="h-px bg-gray-700 mb-4"></div>
        <div className="flex items-center gap-2 mb-4 bg-gray-700 p-2 rounded-md">
          <input
            type="text"
            placeholder="Search for thread name"
            className="w-full bg-transparent outline-none text-white placeholder-gray-400"
          />
          <img src={search} alt="Search" className="w-4 h-4" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSubmit}
            className="flex-1 bg-blue-600 text-white py-1 px-2 rounded-md"
          >
            Create
          </button>
          <img src={plus} alt="Plus" className="w-6 h-6" />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default Threads;
const CoverNav = styled.div`
  min-width: 30rem;
  min-height: 3rem;
  position: absolute;
  z-index: 231111111111;
  left: 43rem;
  top: 4rem;
  border-radius: 0.2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 0.5rem;
  background-color: #1e1f22;
  color: white;
  @media (max-width: 1616px) {
    left: 25rem;
  }
  @media (max-width: 1364px) {
    left: 12rem;
  }
  @media (max-width: 1220px) {
    left: 2rem;
  }
  @media (max-width: 1220px) {
    left: -13rem;
  }
  .Nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .Emogy {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    img {
      width: 1.5rem;
    }
  }
  .Divider {
    width: 0.1px;
    height: 2rem;
    background-color: #313338;
  }
  .Search {
    min-width: 10rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background-color: #2b2d31;
    border-radius: 0.25rem;

    input {
      width: 10rem;
      height: 1.5rem;
      background-color: #2b2d31;
      border-radius: 0.25rem;
      outline: none;

      border: none;
      padding: 0 0.5rem;
      color: #c6c6c6;
    }
    img {
      width: 1rem;
      margin-right: 3px;
    }
    margin-right: 1rem;
  }
  .Create {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    button {
      width: 5rem;
      height: 1.5rem;
      background-color: #5865f2;
      border-radius: 0.3rem;
      border: none;
      color: white;
    }
    img {
      width: 1.5rem;
    }
  }
`;
